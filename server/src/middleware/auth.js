const jwt = require('jsonwebtoken');
const { get } = require('../db/database');
const { getJwtSecret } = require('../config/secret');

const JWT_OPTIONS = { algorithms: ['HS256'] };

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '24h' });
}

// Middleware to verify JWT and check live user active status
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, getJwtSecret(), JWT_OPTIONS);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  try {
    // Live database check: Verify user still exists and is ACTIVE
    const user = await get("SELECT id, username, full_name, role, is_active FROM users WHERE id = ?", [decoded.id]);

    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    if (user.is_active !== 1) {
      return res.status(403).json({ error: 'User account is deactivated. Access revoked.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth Lookup Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Middleware to restrict route to specific roles (e.g. 'ADMIN')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  signToken
};
