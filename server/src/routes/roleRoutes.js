const express = require('express');
const { transaction } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const { PERMISSIONS, listRoles } = require('../services/permissions');
const users = require('../services/userService');

const router = express.Router();

router.use(authenticateToken);
router.use(requirePermission('users.manage'));

const catalog = () => Object.entries(PERMISSIONS).map(([code, p]) => ({ code, ...p }));

// GET /api/roles - roles with their permissions and discount limits, plus the permission catalog
router.get('/', (req, res) => {
  res.json({ roles: listRoles(), permissions: catalog() });
});

// PUT /api/roles/:code - edit a role's permissions and/or discount limit (not OWNER, not your own role)
router.put('/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase();
  try {
    const out = users.validateRolePatch(code, req.body, req.user);
    const before = users.roleSnapshot(code);
    transaction(() => {
      users.applyRolePatch(code, out);
      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: 'ROLE_UPDATE',
        entityType: 'role',
        entityId: 0,
        oldValue: before,
        newValue: users.roleSnapshot(code)
      });
    });
    return res.json({ role: listRoles().find((r) => r.code === code) });
  } catch (err) {
    if (err instanceof users.UserError) {
      return res.status(err.status).json({ error: err.fields._ || err.message, fields: err.fields });
    }
    throw err;
  }
});

module.exports = router;
