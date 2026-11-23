// Shop calendar: local dates in the shop's time zone, financial years, and business days.
//
// - Calendar date: the date on the wall clock in the shop's time zone. Invoice numbering and the
//   financial year use this (GST invoice date is the actual date of the bill).
// - Business date: the calendar date of (time - cutoff). With cutoff 02:00, a bill at 01:30 on the
//   2nd counts in the 1st's reports. Reports and day filters use this.

const settings = require('./settingsService');

const getTimeZone = () => settings.getSettingSync('time_zone');
const getFyStartMonth = () => settings.getSettingSync('fy_start_month');

function getCutoffMinutes() {
  const [h, m] = settings.getSettingSync('business_day_cutoff').split(':').map(Number);
  return h * 60 + m;
}

const formatters = new Map();
function partsFormatter(timeZone) {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    formatters.set(timeZone, fmt);
  }
  return fmt;
}

/** Wall-clock parts of an instant in a time zone. */
function zonedParts(date, timeZone) {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second)
  };
}

/** Calendar date of `date` in the shop's (or given) time zone: { year, month (1-12), day }. */
function localDateParts(date = new Date(), timeZone = getTimeZone()) {
  const { year, month, day } = zonedParts(date, timeZone);
  return { year, month, day };
}

/** Offset of a time zone from UTC at an instant, in minutes (IST = +330). */
function offsetMinutes(date, timeZone) {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** The instant when the wall clock in `timeZone` shows the given local date and time. */
function zonedTimeToUtc(year, month, day, hour, minute, timeZone = getTimeZone()) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ts = guess - offsetMinutes(new Date(guess), timeZone) * 60000;
  // Second pass corrects for a daylight-saving change between the guess and the result
  ts = guess - offsetMinutes(new Date(ts), timeZone) * 60000;
  return new Date(ts);
}

const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = ({ year, month, day }) => `${year}-${pad2(month)}-${pad2(day)}`;

/** Calendar date YYYY-MM-DD in the shop's time zone. */
function today(date = new Date()) {
  return isoDate(localDateParts(date));
}

/** Business date YYYY-MM-DD of an instant (calendar date of time minus the cutoff). */
function businessDate(date = new Date()) {
  return isoDate(localDateParts(new Date(date.getTime() - getCutoffMinutes() * 60000)));
}

function parseIsoDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

function addDays({ year, month, day }, n) {
  const d = new Date(Date.UTC(year, month - 1, day + n));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * UTC instants covering business dates [startDate, endDate] inclusive, as ISO strings for
 * `created_at >= from AND created_at < to`. Either bound may be omitted (open range).
 * Throws on a malformed date.
 */
function businessRangeUtc(startDate, endDate) {
  const cutoff = getCutoffMinutes();
  const tz = getTimeZone();
  const boundary = (parts) =>
    zonedTimeToUtc(parts.year, parts.month, parts.day, Math.floor(cutoff / 60), cutoff % 60, tz).toISOString();

  let from = null;
  let to = null;
  if (startDate) {
    const s = parseIsoDate(startDate);
    if (!s) throw Object.assign(new Error(`Invalid date "${startDate}" (expected YYYY-MM-DD)`), { status: 400 });
    from = boundary(s);
  }
  if (endDate) {
    const e = parseIsoDate(endDate);
    if (!e) throw Object.assign(new Error(`Invalid date "${endDate}" (expected YYYY-MM-DD)`), { status: 400 });
    to = boundary(addDays(e, 1));
  }
  return { from, to };
}

/**
 * Financial year containing a local date.
 * April start: 23 Nov 2025 -> { startYear: 2025, key: '2025-26', short: '25-26' }.
 * January start: the FY is the calendar year -> { key: '2025', short: '2025' }.
 */
function financialYear({ year, month }, startMonth = getFyStartMonth()) {
  const startYear = month >= startMonth ? year : year - 1;
  const start = { year: startYear, month: startMonth, day: 1 };
  const end = addDays({ year: startYear + 1, month: startMonth, day: 1 }, -1);
  const base = { startYear, start_date: isoDate(start), end_date: isoDate(end) };
  if (startMonth === 1) return { ...base, key: String(startYear), short: String(startYear) };
  const endShort = pad2((startYear + 1) % 100);
  return { ...base, key: `${startYear}-${endShort}`, short: `${pad2(startYear % 100)}-${endShort}` };
}

/** Facts the screens need: current business date, calendar date and financial year. */
function describe(date = new Date()) {
  const fy = financialYear(localDateParts(date));
  return {
    time_zone: getTimeZone(),
    business_date: businessDate(date),
    calendar_date: today(date),
    financial_year: { key: fy.key, label: fy.short, start_date: fy.start_date, end_date: fy.end_date }
  };
}

module.exports = {
  getTimeZone,
  getFyStartMonth,
  getCutoffMinutes,
  localDateParts,
  zonedTimeToUtc,
  today,
  businessDate,
  businessRangeUtc,
  financialYear,
  describe
};
