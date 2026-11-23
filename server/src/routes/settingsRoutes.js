const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getAllSettings, updateSettings } = require('../services/settingsService');
const { logAudit } = require('../services/auditService');

const router = express.Router();

router.use(authenticateToken);

// GET /api/settings - all staff (billing screen needs e.g. the cashier discount cap)
router.get('/', async (req, res) => {
  try {
    return res.json(await getAllSettings());
  } catch (err) {
    console.error('Fetch Settings Error:', err);
    return res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings - Admin only, partial update of known keys
router.put('/', requireRole('ADMIN'), async (req, res) => {
  let changes;
  try {
    const before = await getAllSettings();
    changes = await updateSettings(req.body);
    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'SETTINGS_UPDATE',
      entityType: 'settings',
      entityId: 0,
      oldValue: Object.fromEntries(Object.keys(changes).map((k) => [k, before[k]])),
      newValue: changes
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  return res.json(await getAllSettings());
});

module.exports = router;
