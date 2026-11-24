// Shared bits for the Settings screens and the setup wizard.

/** fetch -> { ok, status, data } (data is the parsed JSON body, or {}). */
export async function apiJson(fetcher, url, { method = 'GET', body, form } = {}) {
  const opts = { method };
  if (form) opts.body = form;
  else if (body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetcher(url, opts);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch (err) {
    return { ok: false, status: 0, data: { error: err.message || 'Network error' } };
  }
}

/** Only the keys whose value differs from the original. */
export function changedFields(form, original) {
  const out = {};
  for (const key of Object.keys(form)) {
    if (JSON.stringify(form[key] ?? '') !== JSON.stringify(original?.[key] ?? '')) out[key] = form[key];
  }
  return out;
}

// GST state / UT codes (same list as the server; needed before login in the setup wizard).
export const GST_STATES = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'],
  ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'],
  ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'], ['97', 'Other Territory']
].map(([code, name]) => ({ code, name }));

export const REGISTRATION_LABELS = {
  REGULAR: 'Regular GST',
  COMPOSITION: 'Composition scheme',
  UNREGISTERED: 'Not registered for GST'
};

export const LICENCE_TYPES = [
  { type: 'FSSAI', name: 'FSSAI licence / registration', default_label: 'FSSAI Lic. No.' },
  { type: 'DRUG', name: 'Drug licence', default_label: 'D.L. No.' },
  { type: 'SHOP_ESTABLISHMENT', name: 'Shop & Establishment registration', default_label: 'Shop & Est. Reg. No.' },
  { type: 'TRADE', name: 'Trade licence', default_label: 'Trade Lic. No.' },
  { type: 'OTHER', name: 'Other (custom label)', default_label: '' }
];

export const RESET_LABELS = {
  NEVER: 'Never (one running sequence)',
  FINANCIAL_YEAR: 'Every financial year',
  YEARLY: 'Every calendar year',
  MONTHLY: 'Every month',
  DAILY: 'Every day'
};

export const SEPARATOR_OPTIONS = [
  { value: '/', label: 'Slash  /' },
  { value: '-', label: 'Dash  -' },
  { value: '', label: 'None' }
];

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const COMMON_TIME_ZONES = [
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: 'UAE (Asia/Dubai)' },
  { value: 'Asia/Singapore', label: 'Singapore (Asia/Singapore)' },
  { value: 'Asia/Kathmandu', label: 'Nepal (Asia/Kathmandu)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka (Asia/Colombo)' },
  { value: 'Europe/London', label: 'UK (Europe/London)' },
  { value: 'America/New_York', label: 'US East (America/New_York)' }
];

/** Local preview of a number series format, same rules as the server (for the wizard, before login). */
export function previewSeries(s, n = 1, date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const pad2 = (v) => String(v).padStart(2, '0');
  const fyStart = m >= 4 ? y : y - 1;
  const tokens = {
    NEVER: `${pad2(fyStart % 100)}-${pad2((fyStart + 1) % 100)}`,
    FINANCIAL_YEAR: `${pad2(fyStart % 100)}-${pad2((fyStart + 1) % 100)}`,
    YEARLY: String(y),
    MONTHLY: `${pad2(y % 100)}${pad2(m)}`,
    DAILY: `${pad2(y % 100)}${pad2(m)}${pad2(date.getDate())}`
  };
  const parts = [];
  if (s.prefix) parts.push(s.prefix);
  if (s.include_period) parts.push(tokens[s.reset_policy] || tokens.NEVER);
  parts.push(String(n).padStart(Number(s.padding) || 1, '0'));
  return parts.join(s.separator ?? '') + (s.suffix || '');
}
