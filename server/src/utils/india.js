// India-specific reference data and validators: GST state codes, GSTIN, PAN, PIN code, FSSAI.

// GST state / UT codes (first two digits of a GSTIN). 25 (old Daman & Diu, merged into 26 in 2020)
// and 28 (pre-2014 Andhra Pradesh) are no longer issued, so they are not offered.
const GST_STATES = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' }
];
const STATE_BY_CODE = new Map(GST_STATES.map((s) => [s.code, s]));

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** GSTIN check character (15th) computed from the first 14 characters (GSTN mod-36 scheme). */
function gstinCheckChar(first14) {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/** Returns null if valid, otherwise a human-readable reason. Expects upper-case input. */
function gstinError(gstin) {
  if (gstin.length !== 15) return 'GSTIN must be 15 characters';
  if (!GSTIN_PATTERN.test(gstin)) return 'GSTIN format is invalid (e.g. 27AAPFU0939F1ZV)';
  if (!STATE_BY_CODE.has(gstin.slice(0, 2))) return `GSTIN starts with unknown state code ${gstin.slice(0, 2)}`;
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) return 'GSTIN check digit does not match (possible typo)';
  return null;
}

const panFromGstin = (gstin) => gstin.slice(2, 12);
const isValidPan = (pan) => PAN_PATTERN.test(pan);
const isValidPincode = (pin) => /^[1-9][0-9]{5}$/.test(pin);
const isValidFssai = (num) => /^[0-9]{14}$/.test(num);

/** Indian phone: 10-digit mobile, or landline with STD code; allows +91, spaces and dashes. */
function isValidPhone(phone) {
  const digits = phone.replace(/[\s-]/g, '').replace(/^\+91/, '').replace(/^0/, '');
  return /^[0-9]{10,11}$/.test(digits);
}

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

module.exports = {
  GST_STATES,
  STATE_BY_CODE,
  gstinCheckChar,
  gstinError,
  panFromGstin,
  isValidPan,
  isValidPincode,
  isValidFssai,
  isValidPhone,
  isValidEmail
};
