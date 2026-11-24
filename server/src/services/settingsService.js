const { allSync, getSync, runSync } = require('../db/database');

class SettingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function isValidTimeZone(tz) {
  try {
    // Throws RangeError for an unknown zone
    return Boolean(new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone);
  } catch (e) {
    return false;
  }
}

// Known settings: default, parse (validate + normalize, throws SettingError) and optional guard
// (checks whether a change is allowed given current data). Phase 2 (Shop Settings) extends this list.
const SETTINGS = {
  // (Discount limits are per role since Phase 1 step 7: see roles.max_discount_pct.)

  // Shop's time zone (IANA name). Decides the local date of every bill for reports and numbering.
  time_zone: {
    default: 'Asia/Kolkata',
    parse: (v) => {
      const tz = typeof v === 'string' ? v.trim() : '';
      if (!tz || !isValidTimeZone(tz)) throw new SettingError(`"${v}" is not a known time zone (e.g. Asia/Kolkata)`);
      return tz;
    }
  },

  // Month the financial year starts (1-12). India: April.
  fy_start_month: {
    default: 4,
    parse: (v) => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 12) throw new SettingError('fy_start_month must be a month number from 1 to 12');
      return n;
    },
    // Changing it after billing has started would restart invoice numbering mid-year.
    guard: (next, current) => {
      if (next === current) return;
      const billed = getSync('SELECT 1 FROM orders LIMIT 1');
      if (billed) {
        throw new SettingError('The financial year start can only be changed before the first bill is made', 409);
      }
    }
  },

  // Bills made after midnight but before this time count in the previous day's reports (late-night shops).
  business_day_cutoff: {
    default: '00:00',
    parse: (v) => {
      const s = typeof v === 'string' ? v.trim() : '';
      const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
      if (!m || Number(m[1]) * 60 + Number(m[2]) > 6 * 60) {
        throw new SettingError('business_day_cutoff must be a time from 00:00 to 06:00 (HH:MM)');
      }
      return s;
    }
  },

  // ---- Receipt (Phase 2) ----
  receipt_width: {
    default: '58mm',
    parse: (v) => {
      if (v !== '58mm' && v !== '80mm') throw new SettingError("receipt_width must be '58mm' or '80mm'");
      return v;
    }
  },
  receipt_footer: {
    default: 'Thank you for your visit!',
    parse: (v) => {
      if (v === null || v === undefined) return '';
      if (typeof v !== 'string') throw new SettingError('receipt_footer must be text');
      const s = v.trim();
      if (s.length > 200) throw new SettingError('receipt_footer must be at most 200 characters');
      return s;
    }
  },
  receipt_show_gstin: { default: true, parse: (v) => parseBool('receipt_show_gstin', v) },
  receipt_show_licences: { default: true, parse: (v) => parseBool('receipt_show_licences', v) },
  receipt_show_customer: { default: true, parse: (v) => parseBool('receipt_show_customer', v) }
};

function parseBool(key, v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw new SettingError(`${key} must be true or false`);
}

function readStored(key) {
  const row = getSync('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : undefined;
}

function parseStored(key, raw) {
  const def = SETTINGS[key];
  if (raw === undefined) return def.default;
  try {
    return def.parse(JSON.parse(raw));
  } catch (e) {
    return def.default;
  }
}

/** Current value of a setting (synchronous; safe inside transactions). */
function getSettingSync(key) {
  if (!SETTINGS[key]) throw new Error(`Unknown setting: ${key}`);
  return parseStored(key, readStored(key));
}

async function getSetting(key) {
  return getSettingSync(key);
}

function getAllSettingsSync() {
  const stored = Object.fromEntries(allSync('SELECT key, value FROM settings').map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.keys(SETTINGS).map((key) => [key, parseStored(key, stored[key])]));
}

async function getAllSettings() {
  return getAllSettingsSync();
}

async function updateSettings(patch) {
  return updateSettingsSync(patch);
}

/**
 * Validates a patch of known keys without saving. Returns the normalized changes.
 * Throws SettingError; `err.key` names the offending setting.
 */
function validateSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new SettingError('Expected an object of settings');
  const current = getAllSettingsSync();
  const changes = {};
  for (const [key, value] of Object.entries(patch)) {
    const def = SETTINGS[key];
    try {
      if (!def) throw new SettingError(`Unknown setting: ${key}`);
      changes[key] = def.parse(value);
      if (def.guard) def.guard(changes[key], current[key]);
    } catch (err) {
      if (err instanceof SettingError) err.key = key;
      throw err;
    }
  }
  return changes;
}

/** Validates (all keys first, nothing saved on error) and saves the given known keys. Use inside transaction(). */
function updateSettingsSync(patch) {
  const changes = validateSettingsPatch(patch);
  for (const [key, value] of Object.entries(changes)) {
    runSync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  }
  return changes;
}

module.exports = {
  SettingError,
  getSetting,
  getSettingSync,
  getAllSettings,
  getAllSettingsSync,
  updateSettings,
  updateSettingsSync,
  validateSettingsPatch
};
