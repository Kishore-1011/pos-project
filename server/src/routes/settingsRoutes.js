const express = require('express');
const { transaction } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { getAllSettingsSync, updateSettingsSync, SettingError } = require('../services/settingsService');
const { logAuditSync } = require('../services/auditService');
const calendar = require('../services/calendar');

const router = express.Router();

router.use(authenticateToken);

// Settings plus the derived calendar facts screens need (today's business date, current FY).
function snapshot() {
  return { ...getAllSettingsSync(), calendar: calendar.describe() };
}

// GET /api/settings - all staff (billing needs the discount cap; every screen needs the time zone)
router.get('/', (req, res) => {
  res.json(snapshot());
});

// PUT /api/settings - Admin only, partial update of known keys (audited)
router.put('/', requirePermission('settings.manage'), (req, res) => {
  try {
    transaction(() => {
      const before = getAllSettingsSync();
      const changes = updateSettingsSync(req.body);
      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: 'SETTINGS_UPDATE',
        entityType: 'settings',
        entityId: 0,
        oldValue: Object.fromEntries(Object.keys(changes).map((k) => [k, before[k]])),
        newValue: changes
      });
    });
  } catch (err) {
    if (err instanceof SettingError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
  return res.json(snapshot());
});

module.exports = router;
