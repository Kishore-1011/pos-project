const { runSync } = require('../db/database');

const INSERT_SQL = `INSERT INTO audit_logs (user_id, user_name, action, entity_type, entity_id, old_value, new_value)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`;

function params({ userId, userName, action, entityType, entityId, oldValue = null, newValue = null }) {
  return [
    userId || null,
    userName || 'SYSTEM',
    action,
    entityType,
    entityId,
    oldValue ? JSON.stringify(oldValue) : null,
    newValue ? JSON.stringify(newValue) : null
  ];
}

/** Use inside transaction(): throws, so a failed audit write rolls the whole change back. */
function logAuditSync(entry) {
  runSync(INSERT_SQL, params(entry));
}

/** Best-effort audit outside a transaction: never fails the request. */
async function logAudit(entry) {
  try {
    runSync(INSERT_SQL, params(entry));
  } catch (err) {
    console.error('[AuditLog Error]: Failed to write audit log entry:', err);
  }
}

module.exports = { logAudit, logAuditSync };
