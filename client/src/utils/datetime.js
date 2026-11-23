// Shop calendar for the screens: the shop's time zone and business-day cutoff come from
// GET /api/settings (loaded after login by AuthContext). Until then, Indian defaults apply.

let shopTimeZone = 'Asia/Kolkata';
let cutoffMinutes = 0;

/** Called with the /api/settings response. */
export function setShopCalendar(settings) {
  if (!settings) return;
  if (settings.time_zone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: settings.time_zone });
      shopTimeZone = settings.time_zone;
    } catch (e) {
      // keep the previous zone if the browser doesn't know this one
    }
  }
  if (typeof settings.business_day_cutoff === 'string') {
    const [h, m] = settings.business_day_cutoff.split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) cutoffMinutes = h * 60 + m;
  }
}

export const getShopTimeZone = () => shopTimeZone;

/** YYYY-MM-DD calendar date of an instant in the shop's time zone. */
export function shopDateString(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: shopTimeZone }).format(d);
}

/** YYYY-MM-DD business date (late-night bills before the cutoff count in the previous day). */
export function businessDateString(d = new Date()) {
  return shopDateString(new Date(d.getTime() - cutoffMinutes * 60000));
}

/** Parses server times: ISO strings, or legacy 'YYYY-MM-DD HH:MM:SS' (UTC without a zone). */
export function parseServerTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)
    ? new Date(s.replace(' ', 'T') + 'Z')
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
