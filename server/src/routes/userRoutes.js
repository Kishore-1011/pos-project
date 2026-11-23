const express = require('express');
const bcrypt = require('bcryptjs');
const { all, get, run } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');

const router = express.Router();

router.use(authenticateToken);

// GET /api/users - Available to all authenticated staff for cashier/filter dropdowns
router.get('/', async (req, res) => {
  try {
    const users = await all(
      "SELECT id, username, full_name, role, is_active, created_at, updated_at FROM users ORDER BY id DESC"
    );
    return res.json(users);
  } catch (err) {
    console.error('Fetch Users Error:', err);
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Admin-only guard for user management operations
router.use(requireRole('ADMIN'));

// POST /api/users
router.post('/', async (req, res) => {
  try {
    const { username, password, full_name, role } = req.body;

    if (!username || !password || !full_name || !role) {
      return res.status(400).json({ error: 'All fields (username, password, full_name, role) are required' });
    }

    if (!['ADMIN', 'CASHIER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Allowed values: ADMIN, CASHIER' });
    }

    const existing = await get("SELECT id FROM users WHERE username = ?", [username.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await run(
      `INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, 1)`,
      [username.trim(), password_hash, full_name.trim(), role]
    );

    const newUser = await get(
      "SELECT id, username, full_name, role, is_active, created_at FROM users WHERE id = ?",
      [result.lastInsertRowid]
    );

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'USER_CREATE',
      entityType: 'user',
      entityId: newUser.id,
      newValue: { username: newUser.username, role: newUser.role, full_name: newUser.full_name }
    });

    return res.status(201).json(newUser);
  } catch (err) {
    console.error('Create User Error:', err);
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

// PATCH /api/users/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    if (is_active !== 0 && is_active !== 1) {
      return res.status(400).json({ error: 'is_active must be 0 (deactivated) or 1 (active)' });
    }

    const user = await get("SELECT id, username, full_name, role, is_active FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot change your own active status' });
    }

    const oldStatus = user.is_active;

    await run(
      "UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [is_active, userId]
    );

    const updatedUser = await get(
      "SELECT id, username, full_name, role, is_active, updated_at FROM users WHERE id = ?",
      [userId]
    );

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'USER_TOGGLE',
      entityType: 'user',
      entityId: userId,
      oldValue: { is_active: oldStatus },
      newValue: { is_active: is_active }
    });

    return res.json(updatedUser);
  } catch (err) {
    console.error('Toggle User Status Error:', err);
    return res.status(500).json({ error: 'Failed to update user status' });
  }
});

// PATCH /api/users/:id/password - Admin Reset Employee Password
router.patch('/:id/password', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { new_password } = req.body;

    if (!new_password || new_password.trim().length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters long' });
    }

    const user = await get("SELECT id, username, full_name, role FROM users WHERE id = ?", [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const password_hash = await bcrypt.hash(new_password.trim(), 10);

    await run(
      "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [password_hash, userId]
    );

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'USER_PASSWORD_RESET',
      entityType: 'user',
      entityId: userId,
      newValue: { username: user.username, role: user.role }
    });

    return res.json({ message: `Password for ${user.username} successfully updated` });
  } catch (err) {
    console.error('Password Reset Error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// PUT /api/users/:id - Admin Update Staff (Username, Full Name, Role)
router.put('/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { username, full_name, role } = req.body;

    if (!username || !full_name) {
      return res.status(400).json({ error: 'Username and Full Name are required' });
    }

    if (role && !['ADMIN', 'CASHIER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Allowed: ADMIN, CASHIER' });
    }

    const existingUser = await get("SELECT id, username, full_name, role, is_active FROM users WHERE id = ?", [userId]);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check username collision with other users
    const duplicate = await get("SELECT id FROM users WHERE username = ? AND id != ?", [username.trim(), userId]);
    if (duplicate) {
      return res.status(400).json({ error: 'Username already taken by another account' });
    }

    const updatedRole = role || existingUser.role;

    await run(
      "UPDATE users SET username = ?, full_name = ?, role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [username.trim(), full_name.trim(), updatedRole, userId]
    );

    const updatedUser = await get(
      "SELECT id, username, full_name, role, is_active, updated_at FROM users WHERE id = ?",
      [userId]
    );

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'USER_UPDATE',
      entityType: 'user',
      entityId: userId,
      oldValue: { username: existingUser.username, full_name: existingUser.full_name, role: existingUser.role },
      newValue: { username: updatedUser.username, full_name: updatedUser.full_name, role: updatedUser.role }
    });

    return res.json(updatedUser);
  } catch (err) {
    console.error('Update User Error:', err);
    return res.status(500).json({ error: 'Failed to update user profile' });
  }
});

module.exports = router;
