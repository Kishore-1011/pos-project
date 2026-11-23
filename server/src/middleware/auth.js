const jwt = require('jsonwebtoken');
const { get } = require('../db/database');

// TODO(Phase 0): replace this hard-coded fallback with a random per-install secret (see docs/PRODUCT_ANALYSIS.md).
const JWT_SECRET = process.env.JWT_SECRET || 'pos_project_offline_secret_key';

// Middleware to verify JWT and check live user active status
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
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
    return res.status(403).json({ error: 'Invalid or expired token' });
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
  JWT_SECRET
};
