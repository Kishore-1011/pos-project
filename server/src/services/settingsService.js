const { all, get, run } = require('../db/database');

// Known settings with defaults and validation. Phase 2 (Shop Settings) extends this list.
const SETTINGS = {
  // Max discount a CASHIER may give on one bill, as % of subtotal. Admins are not limited.
  cashier_max_discount_pct: {
    default: 20,
    parse: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) {
        throw new Error('cashier_max_discount_pct must be a number between 0 and 100');
      }
      return n;
    }
  }
};

async function getSetting(key) {
  const def = SETTINGS[key];
  if (!def) throw new Error(`Unknown setting: ${key}`);
  const row = await get('SELECT value FROM settings WHERE key = ?', [key]);
  if (!row) return def.default;
  try {
    return def.parse(JSON.parse(row.value));
  } catch (e) {
    return def.default;
  }
}

async function getAllSettings() {
  const rows = await all('SELECT key, value FROM settings');
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const result = {};
  for (const [key, def] of Object.entries(SETTINGS)) {
    try {
      result[key] = key in stored ? def.parse(JSON.parse(stored[key])) : def.default;
    } catch (e) {
      result[key] = def.default;
    }
  }
  return result;
}

/** Validates and saves the given known keys. Throws with a readable message on bad input. */
async function updateSettings(patch) {
  const changes = {};
  for (const [key, value] of Object.entries(patch || {})) {
    const def = SETTINGS[key];
    if (!def) throw new Error(`Unknown setting: ${key}`);
    changes[key] = def.parse(value);
  }
  for (const [key, value] of Object.entries(changes)) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  }
  return changes;
}

module.exports = { getSetting, getAllSettings, updateSettings };
