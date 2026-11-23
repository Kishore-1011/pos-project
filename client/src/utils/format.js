// One way to show money and dates everywhere (UI review H5, H6).
//   Money: ₹1,23,456.00 (Indian digit grouping)
//   Date:  23 Nov 2026          DateTime: 23 Nov 2026, 9:16 pm          Time: 9:16 pm
// Dates use the shop's time zone (utils/datetime.js), not the PC's.
import { getShopTimeZone, parseServerTime } from './datetime.js';

const moneyFormatters = new Map();

/** ₹ with Indian grouping. decimals: 2 (default) or 0. Non-numbers show as ₹0.00. */
export function formatMoney(value, { decimals = 2 } = {}) {
  let fmt = moneyFormatters.get(decimals);
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    moneyFormatters.set(decimals, fmt);
  }
  const n = Number(value);
  const safe = Number.isFinite(n) ? n : 0;
  const text = fmt.format(Math.abs(safe));
  return `${safe < 0 ? '−' : ''}₹${text}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const partsFormatters = new Map();

function zoned(value, timeZone) {
  const d = parseServerTime(value);
  if (!d) return null;
  let fmt = partsFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    partsFormatters.set(timeZone, fmt);
  }
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: p.minute };
}

/** 23 Nov 2026 (accepts Date, ISO string, legacy 'YYYY-MM-DD HH:MM:SS', or a plain 'YYYY-MM-DD' date). */
export function formatDate(value, timeZone = getShopTimeZone()) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number); // a calendar date: no time-zone shift
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }
  const z = zoned(value, timeZone);
  return z ? `${z.day} ${MONTHS[z.month - 1]} ${z.year}` : '—';
}

/** 9:16 pm */
export function formatTime(value, timeZone = getShopTimeZone()) {
  const z = zoned(value, timeZone);
  if (!z) return '—';
  const h12 = z.hour % 12 === 0 ? 12 : z.hour % 12;
  return `${h12}:${z.minute} ${z.hour < 12 ? 'am' : 'pm'}`;
}

/** 23 Nov 2026, 9:16 pm */
export function formatDateTime(value, timeZone = getShopTimeZone()) {
  const date = formatDate(value, timeZone);
  return date === '—' ? '—' : `${date}, ${formatTime(value, timeZone)}`;
}
