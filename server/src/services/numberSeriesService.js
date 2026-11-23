const { getSync, allSync, runSync } = require('../db/database');
const calendar = require('./calendar');

// Where each series' numbers are stored, so allocation can skip any number already in use.
const SERIES_TARGETS = {
  INVOICE: { table: 'orders', column: 'invoice_no' },
  CUSTOMER: { table: 'customers', column: 'customer_code' }
};

const RESET_POLICIES = ['NEVER', 'FINANCIAL_YEAR', 'YEARLY', 'MONTHLY', 'DAILY'];
const SEPARATORS = ['/', '-', ''];
const GST_INVOICE_MAX_LENGTH = 16; // GST rule: invoice number up to 16 characters
const AFFIX_PATTERN = /^[A-Za-z0-9/-]*$/; // GST rule: letters, digits, '-' and '/' only

class SeriesError extends Error {
  constructor(fields, status = 400) {
    super('Please correct the highlighted fields');
    this.status = status;
    this.fields = fields;
  }
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Period a date falls in for a reset policy: `key` identifies the counter, `token` goes into the number. */
function periodFor(resetPolicy, date = new Date()) {
  const p = calendar.localDateParts(date);
  const fy = calendar.financialYear(p);
  switch (resetPolicy) {
    case 'NEVER':
      return { key: 'ALL', token: fy.short };
    case 'FINANCIAL_YEAR':
      return { key: `FY:${fy.key}`, token: fy.short };
    case 'YEARLY':
      return { key: `Y:${p.year}`, token: String(p.year) };
    case 'MONTHLY':
      return { key: `M:${p.year}-${pad2(p.month)}`, token: `${pad2(p.year % 100)}${pad2(p.month)}` };
    case 'DAILY':
      return { key: `D:${p.year}-${pad2(p.month)}-${pad2(p.day)}`, token: `${pad2(p.year % 100)}${pad2(p.month)}${pad2(p.day)}` };
    default:
      throw new Error(`Unknown reset policy ${resetPolicy}`);
  }
}

/** e.g. { prefix: 'INV', separator: '/', include_period: 1, padding: 4 } + 7 in FY 25-26 -> 'INV/25-26/0007' */
function formatNumber(series, n, periodToken) {
  const parts = [];
  if (series.prefix) parts.push(series.prefix);
  if (series.include_period) parts.push(periodToken);
  parts.push(String(n).padStart(series.padding, '0'));
  return parts.join(series.separator) + (series.suffix || '');
}

function getSeries(code) {
  return getSync(
    `SELECT code, name, prefix, separator, include_period, padding, suffix, reset_policy, start_number, updated_at
     FROM number_series WHERE code = ?`,
    [code]
  );
}

function lastNumber(code, periodKey) {
  const row = getSync('SELECT last_number FROM number_series_counters WHERE series_code = ? AND period_key = ?', [code, periodKey]);
  return row ? row.last_number : 0;
}

function numberInUse(code, value) {
  const t = SERIES_TARGETS[code];
  return Boolean(getSync(`SELECT 1 FROM ${t.table} WHERE ${t.column} = ? LIMIT 1`, [value]));
}

/** The number the next allocation would produce (no side effects). */
function peekNext(code, date = new Date()) {
  return peekWith(code, getSeries(code), date);
}

/** Like peekNext, but for a given (possibly unsaved) configuration of the series. */
function peekWith(code, s, date = new Date()) {
  const period = periodFor(s.reset_policy, date);
  let n = Math.max(lastNumber(code, period.key) + 1, s.start_number);
  let value = formatNumber(s, n, period.token);
  for (let guard = 0; numberInUse(code, value) && guard < 10000; guard++) {
    n += 1;
    value = formatNumber(s, n, period.token);
  }
  return { number: n, value, period_key: period.key };
}

/**
 * Hands out the next number of a series. MUST be called inside transaction() together with the
 * insert that uses it, so a failed save never consumes a number and two saves never share one.
 * Numbers already present in the target table (e.g. imported data) are skipped.
 */
function allocate(code, date = new Date()) {
  const next = peekNext(code, date);
  runSync(
    `INSERT INTO number_series_counters (series_code, period_key, last_number, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(series_code, period_key) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP`,
    [code, next.period_key, next.number]
  );
  return next.value;
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Validates a partial update of a series against its current settings.
 * Returns { changes, nextNumber } where nextNumber (optional) re-positions the current period's counter.
 */
function validateSeriesPatch(code, patch, current, date = new Date()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new SeriesError({ _: 'Expected an object of fields' });
  const errors = {};
  const changes = {};
  const allowed = new Set(['prefix', 'separator', 'include_period', 'padding', 'suffix', 'reset_policy', 'start_number', 'next_number']);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) errors[key] = 'Unknown or read-only field';

  for (const key of ['prefix', 'suffix']) {
    if (key in patch) {
      const v = str(patch[key]);
      if (v.length > 10) errors[key] = 'At most 10 characters';
      else if (!AFFIX_PATTERN.test(v)) errors[key] = "Only letters, digits, '-' and '/' are allowed";
      else changes[key] = v;
    }
  }
  if ('separator' in patch) {
    if (!SEPARATORS.includes(patch.separator)) errors.separator = "Use '/', '-' or none";
    else changes.separator = patch.separator;
  }
  if ('include_period' in patch) changes.include_period = patch.include_period ? 1 : 0;
  if ('padding' in patch) {
    const v = Number(patch.padding);
    if (!Number.isInteger(v) || v < 1 || v > 8) errors.padding = 'Number length must be 1 to 8 digits';
    else changes.padding = v;
  }
  if ('reset_policy' in patch) {
    const v = str(patch.reset_policy).toUpperCase();
    if (!RESET_POLICIES.includes(v)) errors.reset_policy = `Allowed: ${RESET_POLICIES.join(', ')}`;
    else changes.reset_policy = v;
  }
  if ('start_number' in patch) {
    const v = Number(patch.start_number);
    if (!Number.isInteger(v) || v < 1 || v > 99999999) errors.start_number = 'Start number must be a whole number from 1';
    else changes.start_number = v;
  }
  let nextNumber = null;
  if ('next_number' in patch && patch.next_number !== null && patch.next_number !== '') {
    const v = Number(patch.next_number);
    if (!Number.isInteger(v) || v < 1 || v > 99999999) errors.next_number = 'Next number must be a whole number from 1';
    else nextNumber = v;
  }
  if (Object.keys(errors).length) throw new SeriesError(errors);

  const next = { ...current, ...changes };

  // A series that resets must show the period in the number, otherwise numbers repeat
  // (GST requires invoice numbers to be unique within the financial year).
  if (next.reset_policy !== 'NEVER' && !next.include_period) {
    errors.include_period = 'A series that resets must include the period (e.g. 25-26) or numbers will repeat';
  }
  const period = periodFor(next.reset_policy, date);
  const sample = formatNumber(next, Math.max(nextNumber || 1, 10 ** (next.padding - 1)), period.token);
  if (code === 'INVOICE' && sample.length > GST_INVOICE_MAX_LENGTH) {
    errors.prefix = `Invoice numbers can be at most ${GST_INVOICE_MAX_LENGTH} characters for GST; "${sample}" is ${sample.length}`;
  }

  if (nextNumber !== null) {
    const used = lastNumber(code, period.key);
    if (nextNumber <= used) {
      errors.next_number = `Numbers up to ${used} are already used in this period; next number must be at least ${used + 1}`;
    }
  }
  if (Object.keys(errors).length) throw new SeriesError(errors);
  return { changes, nextNumber, periodKey: period.key };
}

function applySeriesUpdate(code, { changes, nextNumber, periodKey }) {
  const keys = Object.keys(changes);
  if (keys.length) {
    runSync(
      `UPDATE number_series SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE code = ?`,
      [...keys.map((k) => changes[k]), code]
    );
  }
  if (nextNumber !== null) {
    runSync(
      `INSERT INTO number_series_counters (series_code, period_key, last_number, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(series_code, period_key) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP`,
      [code, periodKey, nextNumber - 1]
    );
  }
}

/** Series as shown in settings: config + what the next number will be today. */
function describe(code, date = new Date()) {
  const s = getSeries(code);
  const next = peekNext(code, date);
  return {
    ...s,
    include_period: s.include_period === 1,
    next_value: next.value,
    next_number: next.number,
    current_period: next.period_key
  };
}

function listSeries(date = new Date()) {
  return allSync('SELECT code FROM number_series ORDER BY code').map((r) => describe(r.code, date));
}

const OPTIONS = {
  reset_policies: RESET_POLICIES,
  separators: SEPARATORS,
  invoice_max_length: GST_INVOICE_MAX_LENGTH
};

module.exports = {
  SeriesError,
  SERIES_TARGETS,
  periodFor,
  formatNumber,
  getSeries,
  peekNext,
  peekWith,
  allocate,
  validateSeriesPatch,
  applySeriesUpdate,
  describe,
  listSeries,
  OPTIONS
};
