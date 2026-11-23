const fs = require('fs');
const path = require('path');
const { getDb } = require('./database');
const { getDatabasePath } = require('../config/paths');

// Migrations are numbered files in ./migrations (NNN_name.js) exporting { name, up(db) }.
// Each one runs inside its own transaction and is recorded in schema_migrations, so it runs once.
// Before upgrading a database that already holds data, a backup copy is written next to it.

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function loadMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3}_.+\.js$/.test(f))
    .sort()
    .map((file) => {
      const mod = require(path.join(MIGRATIONS_DIR, file));
      return { version: parseInt(file.slice(0, 3), 10), file, name: mod.name || file, up: mod.up };
    });
}

function hasUserTables(db) {
  const row = db.prepare(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'schema_migrations'"
  ).get();
  return row.n > 0;
}

function backupDatabase(db, label) {
  const dbPath = getDatabasePath();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(path.dirname(dbPath), 'backups', `${path.basename(dbPath, '.db')}-before-${label}-${stamp}.db`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  return target;
}

/** Applies pending migrations. Returns the list of versions applied. */
function migrate({ log = console.log } = {}) {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version));
  const pending = loadMigrations().filter((m) => !applied.has(m.version));
  if (pending.length === 0) return [];

  if (hasUserTables(db)) {
    const target = backupDatabase(db, `v${String(pending[0].version).padStart(3, '0')}`);
    log(`[DB] Backup before upgrade: ${target}`);
  }

  // Table rebuilds (create new, copy, drop old, rename) must run with foreign-key enforcement off,
  // otherwise dropping a referenced table fails. This pragma can't change inside a transaction.
  // Links are checked afterwards; enforcement is switched back on for normal running.
  db.pragma('foreign_keys = OFF');
  try {
    for (const m of pending) {
      db.transaction(() => {
        m.up(db);
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      })();
      log(`[DB] Applied migration ${m.file}`);
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }

  const problems = db.pragma('integrity_check', { simple: true });
  if (problems !== 'ok') throw new Error(`Database integrity check failed after migration: ${problems}`);

  // Old databases were written without link enforcement and may hold orphan rows (e.g. a bill line
  // whose item was removed). Don't refuse to start over that; report it so it can be cleaned up.
  const orphans = db.pragma('foreign_key_check');
  if (orphans.length > 0) {
    const summary = {};
    for (const o of orphans) summary[`${o.table} -> ${o.parent}`] = (summary[`${o.table} -> ${o.parent}`] || 0) + 1;
    log(`[DB] Warning: ${orphans.length} row(s) point at missing records: ${JSON.stringify(summary)}`);
  }
  return pending.map((m) => m.version);
}

module.exports = { migrate, loadMigrations };
