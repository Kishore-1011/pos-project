const express = require('express');
const bcrypt = require('bcryptjs');
const { getSync, allSync, runSync, transaction } = require('../db/database');
const { authenticateToken, signToken, loadSessionUser } = require('../middleware/auth');
const { loginLimiter, recordLoginFailure, recordLoginSuccess } = require('../middleware/loginLimiter');
const { logAuditSync } = require('../services/auditService');
const users = require('../services/userService');

const router = express.Router();

/** Shared by password and PIN login: lockout counting, active check, last-login stamp, token. */
async function completeLogin(req, res, user, secretOk, method) {
  if (!user || !secretOk) {
    recordLoginFailure(req);
    return res.status(401).json({ error: method === 'PIN' ? 'Invalid username or PIN' : 'Invalid username or password' });
  }
  if (user.is_active !== 1) {
    return res.status(403).json({ error: 'Account deactivated. Contact the shop owner.' });
  }
  recordLoginSuccess(req);
  runSync("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [user.id]);
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  return res.json({ token, user: loadSessionUser(user.id) });
}

const bad = (res, msg) => res.status(400).json({ error: msg });

// POST /api/auth/login { username, password }
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return bad(res, 'Username and password are required');
    }
    const user = getSync('SELECT id, username, role, password_hash, is_active FROM users WHERE username = ? COLLATE NOCASE', [username.trim()]);
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    return completeLogin(req, res, user, ok, 'PASSWORD');
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/pin-login { username, pin } - quick user switching at the counter
router.post('/pin-login', loginLimiter, async (req, res) => {
  try {
    const { username, pin } = req.body || {};
    if (typeof username !== 'string' || !username.trim() || pin === undefined || pin === null || pin === '') {
      return bad(res, 'Username and PIN are required');
    }
    const user = getSync('SELECT id, username, role, pin_hash, is_active FROM users WHERE username = ? COLLATE NOCASE', [username.trim()]);
    const ok = user && user.pin_hash ? await bcrypt.compare(String(pin), user.pin_hash) : false;
    return completeLogin(req, res, user, ok, 'PIN');
  } catch (err) {
    console.error('PIN Login Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me - the signed-in user with role, permissions and discount limit
router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

// GET /api/auth/pin-users - who can switch in with a PIN (for the switch-user screen)
router.get('/pin-users', authenticateToken, (req, res) => {
  res.json(allSync(
    `SELECT u.id, u.username, u.full_name, r.name AS role_name FROM users u LEFT JOIN roles r ON r.code = u.role
     WHERE u.is_active = 1 AND u.pin_hash IS NOT NULL ORDER BY u.full_name`
  ));
});

async function verifyCurrentPassword(req, res) {
  const { current_password } = req.body || {};
  const row = getSync('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (typeof current_password !== 'string' || !(await bcrypt.compare(current_password, row.password_hash))) {
    res.status(401).json({ error: 'Current password is incorrect', fields: { current_password: 'Incorrect password' } });
    return false;
  }
  return true;
}

// PUT /api/auth/me/password { current_password, new_password }
router.put('/me/password', authenticateToken, async (req, res) => {
  if (!(await verifyCurrentPassword(req, res))) return;
  const errors = {};
  users.checkPassword(req.body.new_password, errors, 'new_password');
  if (Object.keys(errors).length) return res.status(400).json({ error: errors.new_password, fields: errors });
  const hash = await bcrypt.hash(req.body.new_password, 10);
  transaction(() => {
    users.updateUserRow(req.user.id, { password_hash: hash });
    logAuditSync({ userId: req.user.id, userName: req.user.username, action: 'PASSWORD_CHANGE', entityType: 'user', entityId: req.user.id });
  });
  return res.json({ message: 'Password changed' });
});

// PUT /api/auth/me/pin { current_password, pin } - set or (pin: null) clear your own PIN
router.put('/me/pin', authenticateToken, async (req, res) => {
  if (!(await verifyCurrentPassword(req, res))) return;
  const { pin } = req.body;
  if (pin !== null && !users.PIN_PATTERN.test(String(pin))) {
    return res.status(400).json({ error: 'PIN must be 4 to 6 digits', fields: { pin: 'PIN must be 4 to 6 digits' } });
  }
  const hash = pin === null ? null : await bcrypt.hash(String(pin), 10);
  transaction(() => {
    users.updateUserRow(req.user.id, { pin_hash: hash });
    logAuditSync({
      userId: req.user.id, userName: req.user.username, action: pin === null ? 'PIN_CLEAR' : 'PIN_SET',
      entityType: 'user', entityId: req.user.id
    });
  });
  return res.json({ user: loadSessionUser(req.user.id) });
});

module.exports = router;
