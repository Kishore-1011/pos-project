const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDataDirectory } = require('./paths');

// JWT signing secret: JWT_SECRET env var if set, otherwise a random secret generated
// once per install and kept next to the database (never committed, never hard-coded).
let cached = null;

function getJwtSecret() {
  if (cached) return cached;

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length >= 32) {
    cached = process.env.JWT_SECRET;
    return cached;
  }

  const secretPath = path.join(getDataDirectory(), '.jwt_secret');
  try {
    const existing = fs.readFileSync(secretPath, 'utf8').trim();
    if (existing.length >= 64) {
      cached = existing;
      return cached;
    }
  } catch (e) {
    // Not created yet
  }

  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  cached = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretPath, cached, { encoding: 'utf8', mode: 0o600 });
  return cached;
}

module.exports = { getJwtSecret };
