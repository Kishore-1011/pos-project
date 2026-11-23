// Shop calendar: local date in the shop's time zone and financial-year maths.
// Phase 1 step 6 turns the defaults below into settings (time zone, FY start month, business-day cutoff).

const DEFAULT_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_FY_START_MONTH = 4; // April, as in India

function getTimeZone() {
  return DEFAULT_TIME_ZONE;
}

function getFyStartMonth() {
  return DEFAULT_FY_START_MONTH;
}

const partsFormatters = new Map();

/** Calendar date of `date` in `timeZone`: { year, month (1-12), day }. */
function localDateParts(date = new Date(), timeZone = getTimeZone()) {
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    partsFormatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day) };
}

const pad2 = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD in the shop's time zone. */
function today(date = new Date()) {
  const { year, month, day } = localDateParts(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Financial year containing the given local date.
 * April start: 23 Nov 2025 -> { startYear: 2025, key: '2025-26', short: '25-26' }.
 * January start: the FY is the calendar year -> { key: '2025', short: '2025' }.
 */
function financialYear({ year, month }, startMonth = getFyStartMonth()) {
  const startYear = month >= startMonth ? year : year - 1;
  if (startMonth === 1) return { startYear, key: String(startYear), short: String(startYear) };
  const endShort = pad2((startYear + 1) % 100);
  return {
    startYear,
    key: `${startYear}-${endShort}`,
    short: `${pad2(startYear % 100)}-${endShort}`
  };
}

module.exports = { getTimeZone, getFyStartMonth, localDateParts, today, financialYear };
