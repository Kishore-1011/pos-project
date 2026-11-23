const jwt = require('jsonwebtoken');
const { getSync } = require('../db/database');
const { getJwtSecret } = require('../config/secret');
const { roleAccess } = require('../services/permissions');

const JWT_OPTIONS = { algorithms: ['HS256'] };

function signToken(payload) {
  return jwt.sign(payload, getJwtSecret(), { algorithm: 'HS256', expiresIn: '24h' });
}

/** The user as the app sees them: profile, role and live permissions (never the password or PIN hash). */
function loadSessionUser(userId) {
  const user = getSync(
    `SELECT u.id, u.username, u.full_name, u.role, r.name AS role_name, u.phone, u.email, u.is_active,
            u.pin_hash IS NOT NULL AS has_pin, u.last_login_at
     FROM users u LEFT JOIN roles r ON r.code = u.role
     WHERE u.id = ?`,
    [userId]
  );
  if (!user) return null;
  const access = roleAccess(user.role);
  return {
    ...user,
    has_pin: user.has_pin === 1,
    permissions: [...access.permissions].sort(),
    max_discount_pct: access.max_discount_pct
  };
}

// Verifies the JWT, then re-reads the user so deactivation and role/permission edits apply at once.
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
    const user = loadSessionUser(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }
    if (user.is_active !== 1) {
      return res.status(403).json({ error: 'User account is deactivated. Access revoked.' });
    }
    req.user = user;
    req.can = (permission) => user.permissions.includes(permission);
    next();
  } catch (err) {
    console.error('Auth Lookup Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/** Allows the request if the user has ANY of the given permissions. */
function requirePermission(...permissions) {
  return (req, res, next) => {
    if (!req.user || !permissions.some((p) => req.user.permissions.includes(p))) {
      return res.status(403).json({ error: 'You do not have permission to do this', required: permissions });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requirePermission,
  signToken,
  loadSessionUser
};
