const express = require('express');
const { all } = require('../db/database');
const { authenticateToken, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);
router.use(requirePermission('audit.view'));

// GET /api/audit-logs
router.get('/', async (req, res) => {
  try {
    const { action, entity_type, limit = 100 } = req.query;

    let sql = 'SELECT * FROM audit_logs';
    const conditions = [];
    const params = [];

    if (action) {
      conditions.push('action = ?');
      params.push(action);
    }
    if (entity_type) {
      conditions.push('entity_type = ?');
      params.push(entity_type);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const logs = await all(sql, params);

    // Format JSON fields
    const formattedLogs = logs.map(log => ({
      ...log,
      old_value: log.old_value ? JSON.parse(log.old_value) : null,
      new_value: log.new_value ? JSON.parse(log.new_value) : null
    }));

    return res.json(formattedLogs);
  } catch (err) {
    console.error('Fetch Audit Logs Error:', err);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

module.exports = router;
