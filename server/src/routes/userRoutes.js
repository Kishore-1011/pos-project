const express = require('express');
const bcrypt = require('bcryptjs');
const { transaction } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const users = require('../services/userService');

const router = express.Router();

router.use(authenticateToken);

const publicUser = (u) => (u ? { ...u, has_pin: u.has_pin === 1 || u.has_pin === true } : u);

function sendError(res, err) {
  if (err instanceof users.UserError) {
    return res.status(err.status).json({ error: err.fields._ || err.message, fields: err.fields });
  }
  throw err;
}

function audit(req, action, entityId, oldValue, newValue) {
  logAuditSync({ userId: req.user.id, userName: req.user.username, action, entityType: 'user', entityId, oldValue, newValue });
}

function findUser(req, res) {
  const user = users.getUser(parseInt(req.params.id, 10));
  if (!user) res.status(404).json({ error: 'User not found' });
  return user;
}

// GET /api/users - all staff (staff filters, cashier names); full profiles only for user managers
router.get('/', (req, res) => {
  res.json(users.listUsers({ full: req.can('users.manage') }));
});

router.use(requirePermission('users.manage'));

// POST /api/users - create (username, full_name, role, password; optional phone, email, pin)
router.post('/', async (req, res) => {
  try {
    const prepared = await users.createUser(req.body, req.user);
    const id = transaction(() => {
      const newId = users.insertUser(prepared);
      audit(req, 'USER_CREATE', newId, null, {
        username: prepared.out.username, full_name: prepared.out.full_name, role: prepared.out.role, pin_set: Boolean(prepared.pinHash)
      });
      return newId;
    });
    return res.status(201).json(publicUser(users.getUser(id)));
  } catch (err) {
    return sendError(res, err);
  }
});

// PUT /api/users/:id - partial profile update (username, full_name, role, phone, email)
router.put('/:id', (req, res) => {
  const existing = findUser(req, res);
  if (!existing) return;
  try {
    users.checkCanManage(existing, req.user);
    const { pin, password, ...profile } = req.body || {};
    const out = users.validateUserInput(profile, { actor: req.user, existing });
    const changed = Object.keys(out).filter((k) => out[k] !== existing[k]);
    if (changed.length) {
      transaction(() => {
        users.updateUserRow(existing.id, Object.fromEntries(changed.map((k) => [k, out[k]])));
        audit(req, 'USER_UPDATE', existing.id,
          Object.fromEntries(changed.map((k) => [k, existing[k]])),
          Object.fromEntries(changed.map((k) => [k, out[k]])));
      });
    }
    return res.json(publicUser(users.getUser(existing.id)));
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/users/:id/status - activate / deactivate
router.patch('/:id/status', (req, res) => {
  const target = findUser(req, res);
  if (!target) return;
  const { is_active } = req.body || {};
  if (is_active !== 0 && is_active !== 1 && is_active !== true && is_active !== false) {
    return res.status(400).json({ error: 'is_active must be 0 (deactivated) or 1 (active)' });
  }
  const next = is_active ? 1 : 0;
  try {
    users.checkStatusChange(target, next, req.user);
    transaction(() => {
      users.updateUserRow(target.id, { is_active: next });
      audit(req, 'USER_TOGGLE', target.id, { is_active: target.is_active }, { is_active: next });
    });
    return res.json(publicUser(users.getUser(target.id)));
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/users/:id/password - reset someone's password
router.patch('/:id/password', async (req, res) => {
  const target = findUser(req, res);
  if (!target) return;
  try {
    users.checkCanManage(target, req.user);
    const errors = {};
    users.checkPassword(req.body && req.body.new_password, errors, 'new_password');
    if (Object.keys(errors).length) throw new users.UserError(errors);
    const hash = await bcrypt.hash(req.body.new_password, 10);
    transaction(() => {
      users.updateUserRow(target.id, { password_hash: hash });
      audit(req, 'USER_PASSWORD_RESET', target.id, null, { username: target.username });
    });
    return res.json({ message: `Password for ${target.username} successfully updated` });
  } catch (err) {
    return sendError(res, err);
  }
});

// PUT /api/users/:id/pin - set ({ pin: "1234" }) or clear ({ pin: null }) someone's quick-switch PIN
router.put('/:id/pin', async (req, res) => {
  const target = findUser(req, res);
  if (!target) return;
  try {
    users.checkCanManage(target, req.user);
    const pin = req.body ? req.body.pin : undefined;
    if (pin !== null && !users.PIN_PATTERN.test(String(pin))) throw new users.UserError({ pin: 'PIN must be 4 to 6 digits' });
    const hash = pin === null ? null : await bcrypt.hash(String(pin), 10);
    transaction(() => {
      users.updateUserRow(target.id, { pin_hash: hash });
      audit(req, pin === null ? 'USER_PIN_CLEAR' : 'USER_PIN_SET', target.id, null, { username: target.username });
    });
    return res.json(publicUser(users.getUser(target.id)));
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
