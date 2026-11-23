const { run } = require('../db/database');

async function logAudit({ userId, userName, action, entityType, entityId, oldValue = null, newValue = null }) {
  try {
    const oldStr = oldValue ? JSON.stringify(oldValue) : null;
    const newStr = newValue ? JSON.stringify(newValue) : null;

    await run(
      `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, old_value, new_value)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId || null, userName || 'SYSTEM', action, entityType, entityId, oldStr, newStr]
    );
  } catch (err) {
    console.error('[AuditLog Error]: Failed to write audit log entry:', err);
  }
}

module.exports = { logAudit };
