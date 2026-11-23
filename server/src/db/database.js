const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { getDatabasePath } = require('../config/paths');

// One connection for the whole process. better-sqlite3 is synchronous, so a request handler that
// only does DB work between awaits can't interleave with another request. For multi-step writes
// that must be all-or-nothing (e.g. an order and its lines), use transaction().

let db = null;
const statementCache = new Map();

function getDb() {
  if (db) return db;
  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); // crash-safe, readers don't block the writer
  db.pragma('synchronous = FULL'); // a saved bill survives a power cut
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON'); // links between tables are enforced (sql.js never did)
  return db;
}

function prepare(sql) {
  let stmt = statementCache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    statementCache.set(sql, stmt);
  }
  return stmt;
}

// sql.js accepted undefined/booleans; better-sqlite3 does not. Normalize for compatibility.
function normalize(params) {
  const list = Array.isArray(params) ? params : [params];
  return list.map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));
}

// ---- Synchronous API (use inside transaction()) ----

function runSync(sql, params = []) {
  const info = prepare(sql).run(normalize(params));
  return { lastInsertRowid: Number(info.lastInsertRowid), changes: info.changes };
}

function getSync(sql, params = []) {
  return prepare(sql).get(normalize(params)) || null;
}

function allSync(sql, params = []) {
  return prepare(sql).all(normalize(params));
}

function execSync(sql) {
  getDb().exec(sql);
}

/** Runs fn() in a transaction: commits if it returns, rolls back everything if it throws. */
function transaction(fn) {
  return getDb().transaction(fn)();
}

// ---- Promise API (kept so existing route code is unchanged) ----

async function run(sql, params = []) { return runSync(sql, params); }
async function get(sql, params = []) { return getSync(sql, params); }
async function all(sql, params = []) { return allSync(sql, params); }
async function exec(sql) { return execSync(sql); }

function close() {
  if (db) {
    statementCache.clear();
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  run,
  get,
  all,
  exec,
  runSync,
  getSync,
  allSync,
  execSync,
  transaction,
  close
};
