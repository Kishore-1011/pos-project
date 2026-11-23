const { getSync, allSync, runSync } = require('../db/database');
const india = require('../utils/india');
const numberSeries = require('./numberSeriesService');

const BUSINESS_TYPES = ['FOOD', 'RETAIL', 'SERVICES'];
const REGISTRATION_TYPES = ['REGULAR', 'COMPOSITION', 'UNREGISTERED'];

const LICENCE_TYPES = {
  FSSAI: { label: 'FSSAI Lic. No.', name: 'FSSAI licence / registration' },
  DRUG: { label: 'D.L. No.', name: 'Drug licence' },
  SHOP_ESTABLISHMENT: { label: 'Shop & Est. Reg. No.', name: 'Shop & Establishment registration' },
  TRADE: { label: 'Trade Lic. No.', name: 'Trade licence' },
  OTHER: { label: '', name: 'Other (custom label)' }
};
const MAX_LICENCES = 10;

// Plain text fields: max length. Empty string is allowed (filled in later by the setup wizard).
const TEXT_FIELDS = {
  legal_name: 120,
  trade_name: 120,
  address_line1: 120,
  address_line2: 120,
  city: 60,
  website: 120
};

const ORG_COLUMNS = `legal_name, trade_name, address_line1, address_line2, city, state_code, pincode, phone, email,
  website, logo_url, business_types, gst_registration_type, gstin, pan, setup_completed_at, updated_at`;

class ValidationError extends Error {
  constructor(fields) {
    super('Please correct the highlighted fields');
    this.status = 400;
    this.fields = fields;
  }
}

function getOrganization() {
  const row = getSync(`SELECT ${ORG_COLUMNS} FROM organization WHERE id = 1`);
  return { ...row, business_types: JSON.parse(row.business_types || '[]') };
}

function getLicences() {
  return allSync(
    `SELECT id, type, label, number, valid_until, print_on_bill, sort_order
     FROM licences ORDER BY sort_order, id`
  ).map((l) => ({ ...l, print_on_bill: l.print_on_bill === 1 }));
}

const str = (v) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Validates a partial update against the current profile.
 * Returns the columns to write; throws ValidationError with a per-field message map.
 */
function validateOrganizationPatch(patch, current) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new ValidationError({ _: 'Expected an object of fields' });
  }
  const errors = {};
  const out = {};
  const allowed = new Set([...Object.keys(TEXT_FIELDS), 'state_code', 'pincode', 'phone', 'email',
    'business_types', 'gst_registration_type', 'gstin', 'pan']);

  for (const key of Object.keys(patch)) {
    if (!allowed.has(key)) errors[key] = 'Unknown or read-only field';
  }

  for (const [key, max] of Object.entries(TEXT_FIELDS)) {
    if (key in patch) {
      const v = str(patch[key]);
      if (v.length > max) errors[key] = `Must be at most ${max} characters`;
      else out[key] = v;
    }
  }

  if ('state_code' in patch) {
    const v = str(patch.state_code);
    if (v && !india.STATE_BY_CODE.has(v)) errors.state_code = 'Unknown state code';
    else out.state_code = v || null;
  }
  if ('pincode' in patch) {
    const v = str(patch.pincode);
    if (v && !india.isValidPincode(v)) errors.pincode = 'PIN code must be 6 digits';
    else out.pincode = v;
  }
  if ('phone' in patch) {
    const v = str(patch.phone);
    if (v && !india.isValidPhone(v)) errors.phone = 'Enter a 10-digit mobile or a landline with STD code';
    else out.phone = v;
  }
  if ('email' in patch) {
    const v = str(patch.email).toLowerCase();
    if (v && (!india.isValidEmail(v) || v.length > 120)) errors.email = 'Enter a valid email address';
    else out.email = v;
  }
  if ('business_types' in patch) {
    const v = patch.business_types;
    if (!Array.isArray(v) || v.length === 0) errors.business_types = 'Choose at least one business type';
    else if (v.some((t) => !BUSINESS_TYPES.includes(t))) errors.business_types = `Allowed: ${BUSINESS_TYPES.join(', ')}`;
    else out.business_types = BUSINESS_TYPES.filter((t) => v.includes(t)); // de-duplicated, stable order
  }
  if ('gst_registration_type' in patch) {
    const v = str(patch.gst_registration_type).toUpperCase();
    if (!REGISTRATION_TYPES.includes(v)) errors.gst_registration_type = `Allowed: ${REGISTRATION_TYPES.join(', ')}`;
    else out.gst_registration_type = v;
  }
  if ('gstin' in patch) {
    const v = str(patch.gstin).toUpperCase().replace(/\s/g, '');
    const problem = v ? india.gstinError(v) : null;
    if (problem) errors.gstin = problem;
    else out.gstin = v || null;
  }
  if ('pan' in patch) {
    const v = str(patch.pan).toUpperCase().replace(/\s/g, '');
    if (v && !india.isValidPan(v)) errors.pan = 'PAN format is invalid (e.g. AAPFU0939F)';
    else out.pan = v || null;
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);

  // Cross-field rules, checked on the profile as it will be after this update
  const next = { ...current, ...out };
  const registered = next.gst_registration_type !== 'UNREGISTERED';
  if (registered && !next.gstin) {
    errors.gstin = 'GSTIN is required for a GST-registered business';
  }
  if (!registered && next.gstin) {
    errors.gstin = 'Remove the GSTIN or choose Regular / Composition registration';
  }
  if (next.gstin) {
    const gstState = next.gstin.slice(0, 2);
    if (next.state_code && next.state_code !== gstState) {
      errors.state_code = `GSTIN belongs to ${india.STATE_BY_CODE.get(gstState).name} (${gstState}); the selected state does not match`;
    } else if (!next.state_code) {
      out.state_code = gstState; // fill in from the GSTIN
    }
    const gstPan = india.panFromGstin(next.gstin);
    if (next.pan && next.pan !== gstPan) {
      errors.pan = `PAN does not match the GSTIN (expected ${gstPan})`;
    } else if (!next.pan) {
      out.pan = gstPan; // fill in from the GSTIN
    }
  }

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return out;
}

function updateOrganization(changes) {
  const keys = Object.keys(changes);
  if (keys.length === 0) return;
  const values = keys.map((k) => (k === 'business_types' ? JSON.stringify(changes[k]) : changes[k]));
  runSync(
    `UPDATE organization SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
    values
  );
}

/** Validates the full licence list (replace-all semantics). Returns normalized rows. */
function validateLicences(list) {
  if (!Array.isArray(list)) throw new ValidationError({ licences: 'Expected a list of licences' });
  if (list.length > MAX_LICENCES) throw new ValidationError({ licences: `At most ${MAX_LICENCES} licences` });

  const errors = {};
  const seen = new Set();
  const rows = list.map((raw, i) => {
    const l = raw && typeof raw === 'object' ? raw : {};
    const type = str(l.type).toUpperCase();
    const number = str(l.number).replace(/\s+/g, ' ');
    const err = (msg) => { errors[`licences[${i}]`] = msg; };

    if (!LICENCE_TYPES[type]) err(`Unknown licence type. Allowed: ${Object.keys(LICENCE_TYPES).join(', ')}`);
    else if (!number) err('Licence number is required');
    else if (number.length > 50) err('Licence number is too long');
    else if (type === 'FSSAI' && !india.isValidFssai(number.replace(/\s/g, ''))) err('FSSAI number must be 14 digits');

    let label = str(l.label) || (LICENCE_TYPES[type] ? LICENCE_TYPES[type].label : '');
    if (type === 'OTHER' && !label) err('A label is required for "Other" licences');
    if (label.length > 40) err('Label is too long');

    let validUntil = str(l.valid_until) || null;
    if (validUntil && (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil) || Number.isNaN(Date.parse(`${validUntil}T00:00:00Z`)))) {
      err('Valid-until date must be YYYY-MM-DD');
    }

    const cleanNumber = type === 'FSSAI' ? number.replace(/\s/g, '') : number;
    const key = `${type}|${cleanNumber}`;
    if (seen.has(key)) err('Duplicate licence');
    seen.add(key);

    return {
      type,
      label,
      number: cleanNumber,
      valid_until: validUntil,
      print_on_bill: l.print_on_bill === undefined ? true : Boolean(l.print_on_bill),
      sort_order: i
    };
  });

  if (Object.keys(errors).length) throw new ValidationError(errors);
  return rows;
}

function replaceLicences(rows) {
  runSync('DELETE FROM licences');
  for (const r of rows) {
    runSync(
      `INSERT INTO licences (type, label, number, valid_until, print_on_bill, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
      [r.type, r.label, r.number, r.valid_until, r.print_on_bill ? 1 : 0, r.sort_order]
    );
  }
}

/** Non-blocking compliance hints shown to the owner. `today` is YYYY-MM-DD in the shop's time zone. */
function complianceWarnings(org, licences, today) {
  const warnings = [];
  if (!org.legal_name && !org.trade_name) {
    warnings.push({ code: 'NAME_MISSING', message: 'Business name is not set; bills will not show it.' });
  }
  if (org.business_types.includes('FOOD') && !licences.some((l) => l.type === 'FSSAI')) {
    warnings.push({
      code: 'FSSAI_MISSING',
      message: 'Food businesses must show an FSSAI licence or registration number on bills.'
    });
  }
  if (org.gst_registration_type !== 'UNREGISTERED') {
    const invoiceSeries = numberSeries.getSeries('INVOICE');
    if (invoiceSeries && numberSeries.gstIssues(invoiceSeries).length) {
      warnings.push({
        code: 'INVOICE_SERIES_NOT_GST',
        message: 'Your invoice number format does not meet GST rules (max 16 characters; letters, digits, - and / only). Update it in Number Series.'
      });
    }
  }
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 30);
  const soonStr = soon.toISOString().slice(0, 10);
  for (const l of licences) {
    if (!l.valid_until) continue;
    const name = LICENCE_TYPES[l.type].name;
    if (l.valid_until < today) {
      warnings.push({ code: 'LICENCE_EXPIRED', message: `${name} ${l.number} expired on ${l.valid_until}.` });
    } else if (l.valid_until <= soonStr) {
      warnings.push({ code: 'LICENCE_EXPIRING', message: `${name} ${l.number} expires on ${l.valid_until}.` });
    }
  }
  return warnings;
}

const OPTIONS = {
  states: india.GST_STATES,
  business_types: BUSINESS_TYPES,
  registration_types: REGISTRATION_TYPES,
  licence_types: Object.entries(LICENCE_TYPES).map(([type, v]) => ({ type, name: v.name, default_label: v.label }))
};

module.exports = {
  ValidationError,
  getOrganization,
  getLicences,
  validateOrganizationPatch,
  updateOrganization,
  validateLicences,
  replaceLicences,
  complianceWarnings,
  OPTIONS
};
