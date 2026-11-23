const express = require('express');
const bcrypt = require('bcryptjs');
const { get } = require('../db/database');
const { authenticateToken, signToken } = require('../middleware/auth');
const { loginLimiter, recordLoginFailure, recordLoginSuccess } = require('../middleware/loginLimiter');

const router = express.Router();

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await get("SELECT * FROM users WHERE username = ?", [username.trim()]);
    const isValidPassword = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !isValidPassword) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({ error: 'Account deactivated. Contact system admin.' });
    }

    recordLoginSuccess(req);
    const token = signToken({ id: user.id, username: user.username, role: user.role });

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        role: user.role,
        is_active: user.is_active
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
