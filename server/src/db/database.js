const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { getDatabasePath } = require('../config/paths');

function findSqlWasmPath(file = 'sql-wasm.wasm') {
  // 1. Try resolving relative to sql.js package entry
  try {
    const sqlDist = path.dirname(require.resolve('sql.js'));
    const candidate = path.join(sqlDist, file);
    if (fs.existsSync(candidate)) return candidate;
  } catch (e) {}

  // 2. Try electron asar unpacked directory
  if (process.resourcesPath) {
    const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file);
    if (fs.existsSync(unpacked)) return unpacked;
  }

  // 3. Fallback candidate paths
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', file),
    path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
    path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file)
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return file;
}

let db = null;
let SqlJs = null;

// Initialize SQL.js and load database file
async function getDb() {
  if (db) return db;

  const wasmPath = findSqlWasmPath('sql-wasm.wasm');
  let wasmBinary = undefined;
  try {
    if (fs.existsSync(wasmPath)) {
      wasmBinary = fs.readFileSync(wasmPath);
    }
  } catch (err) {
    console.warn('[DB] Could not synchronously read wasm binary:', err.message);
  }

  const initOptions = {
    locateFile: (file) => findSqlWasmPath(file)
  };
  if (wasmBinary) {
    initOptions.wasmBinary = wasmBinary;
  }

  try {
    SqlJs = await initSqlJs(initOptions);
  } catch (err) {
    console.warn('[DB] Primary sql.js init failed, trying fallback:', err.message);
    SqlJs = await initSqlJs();
  }

  const currentDbPath = getDatabasePath();
  const dbDir = path.dirname(currentDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (fs.existsSync(currentDbPath)) {
    const fileBuffer = fs.readFileSync(currentDbPath);
    db = new SqlJs.Database(fileBuffer);
  } else {
    db = new SqlJs.Database();
    saveDbInternal(db);
  }

  return db;
}

function saveDbInternal(databaseInstance) {
  const targetDb = databaseInstance || db;
  if (!targetDb) return;
  const currentDbPath = getDatabasePath();
  const dbDir = path.dirname(currentDbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  const data = targetDb.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(currentDbPath, buffer);
}

function saveDb() {
  saveDbInternal(db);
}

// Synchronous / Promisified helper queries
async function run(sql, params = []) {
  const database = await getDb();
  database.run(sql, params);
  // Get last inserted ID if applicable BEFORE exporting/saving to file
  const res = database.exec("SELECT last_insert_rowid() as id;");
  const lastId = res && res[0] && res[0].values && res[0].values[0] ? res[0].values[0][0] : null;
  saveDb();
  return { lastInsertRowid: lastId };
}

async function get(sql, params = []) {
  const database = await getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

async function all(sql, params = []) {
  const database = await getDb();
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

async function exec(sql) {
  const database = await getDb();
  database.exec(sql);
  saveDb();
}

module.exports = {
  getDb,
  saveDb,
  run,
  get,
  all,
  exec
};
