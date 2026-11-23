const path = require('path');
const { DB_FILENAME } = require('./brand');

// Electron sets POS_USER_DATA_PATH (and the explicit overrides) to %APPDATA%\<app>.
// In plain web/dev mode everything lives under server/.
const SERVER_ROOT = path.join(__dirname, '..', '..');

function getDatabasePath() {
  if (process.env.POS_DB_PATH) return process.env.POS_DB_PATH;
  if (process.env.POS_USER_DATA_PATH) return path.join(process.env.POS_USER_DATA_PATH, 'data', DB_FILENAME);
  return path.join(SERVER_ROOT, DB_FILENAME);
}

function getUploadsDirectory() {
  if (process.env.POS_UPLOADS_PATH) return process.env.POS_UPLOADS_PATH;
  if (process.env.POS_USER_DATA_PATH) return path.join(process.env.POS_USER_DATA_PATH, 'uploads', 'items');
  return path.join(SERVER_ROOT, 'uploads', 'items');
}

// Folder holding the DB and other per-install files (e.g. the JWT secret).
function getDataDirectory() {
  return path.dirname(getDatabasePath());
}

module.exports = { getDatabasePath, getUploadsDirectory, getDataDirectory };
