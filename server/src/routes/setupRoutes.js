const express = require('express');
const bcrypt = require('bcryptjs');
const { getSync, runSync, transaction } = require('../db/database');
const { signToken, loadSessionUser } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const { PRODUCT_NAME } = require('../config/brand');
const { OWNER_ROLE } = require('../services/permissions');
const org = require('../services/organizationService');
const series = require('../services/numberSeriesService');
const settings = require('../services/settingsService');
const users = require('../services/userService');

// First-run setup wizard API. Open without login ONLY while setup has not been completed; the server
// listens on 127.0.0.1 and refuses other origins, so it is reachable only from this computer.

const router = express.Router();

const isSetupRequired = () => {
  const row = getSync('SELECT setup_completed_at FROM organization WHERE id = 1');
  return !row || !row.setup_completed_at;
};

const isObject = (v) => v && typeof v === 'object' && !Array.isArray(v);
const prefixFields = (prefix, fields) =>
  Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k === '_' ? prefix : `${prefix}.${k}`, v]));

/** The account the owner details are written onto: the seeded 'admin', else the first active owner. */
function findOwnerAccount() {
  return getSync("SELECT * FROM users WHERE username = 'admin' COLLATE NOCASE AND role = ? ORDER BY id LIMIT 1", [OWNER_ROLE])
    || getSync('SELECT * FROM users WHERE role = ? AND is_active = 1 ORDER BY id LIMIT 1', [OWNER_ROLE]);
}

class SetupInvalid extends Error {
  constructor(fields) {
    super('Please correct the highlighted fields');
    this.fields = fields;
  }
}

// GET /api/setup/status
router.get('/status', (req, res) => {
  res.json({ setup_required: isSetupRequired(), product_name: PRODUCT_NAME });
});

// POST /api/setup/complete
router.post('/complete', async (req, res) => {
  if (!isSetupRequired()) return res.status(409).json({ error: 'Setup has already been completed' });

  const body = isObject(req.body) ? req.body : {};
  const owner = isObject(body.owner) ? body.owner : {};

  // ---- Owner checks that don't need the database, and password/PIN hashing (async, before the transaction)
  const fields = {};
  const pwErrors = {};
  users.checkPassword(owner.password, pwErrors, 'password');
  Object.assign(fields, prefixFields('owner', pwErrors));
  const pin = owner.pin === undefined || owner.pin === null || owner.pin === '' ? null : String(owner.pin);
  if (pin !== null && !users.PIN_PATTERN.test(pin)) fields['owner.pin'] = 'PIN must be 4 to 6 digits';
  const passwordHash = fields['owner.password'] ? null : await bcrypt.hash(owner.password, 10);
  const pinHash = pin && !fields['owner.pin'] ? await bcrypt.hash(pin, 10) : null;

  let ownerId;
  try {
    ownerId = transaction(() => {
      if (!isSetupRequired()) throw Object.assign(new Error('Setup has already been completed'), { status: 409 });
      const errors = { ...fields };
      const actorRow = findOwnerAccount();

      // ---- Organization (applied first so the invoice series is validated against the new GST status)
      const orgPatch = isObject(body.organization) ? body.organization : null;
      let orgChanges = null;
      if (!orgPatch) {
        errors.organization = 'Business details are required';
      } else {
        try {
          orgChanges = org.validateOrganizationPatch(orgPatch, org.getOrganization());
          const nameOk = (orgChanges.legal_name || '') || (orgChanges.trade_name || '');
          if (!nameOk) errors['organization.legal_name'] = 'Enter the business name (legal or trade name)';
          if (!('business_types' in orgPatch)) errors['organization.business_types'] = 'Choose at least one business type';
          org.updateOrganization(orgChanges);
        } catch (err) {
          if (!(err instanceof org.ValidationError)) throw err;
          Object.assign(errors, prefixFields('organization', err.fields));
        }
      }

      // ---- Licences (optional)
      let licenceRows = null;
      if (body.licences !== undefined && body.licences !== null) {
        try {
          licenceRows = org.validateLicences(body.licences);
          org.replaceLicences(licenceRows);
        } catch (err) {
          if (!(err instanceof org.ValidationError)) throw err;
          for (const [k, v] of Object.entries(err.fields)) errors[k.startsWith('licences') ? k : `licences.${k}`] = v;
        }
      }

      // ---- Settings (optional) — before series so a changed FY start / time zone applies to numbering
      let settingChanges = null;
      if (body.settings !== undefined && body.settings !== null) {
        try {
          settingChanges = settings.updateSettingsSync(body.settings);
        } catch (err) {
          if (!(err instanceof settings.SettingError)) throw err;
          errors[err.key ? `settings.${err.key}` : 'settings'] = err.message;
        }
      }

      // ---- Number series (optional)
      const seriesApplied = [];
      if (body.number_series !== undefined && body.number_series !== null) {
        if (!isObject(body.number_series)) {
          errors.number_series = 'Expected INVOICE and/or CUSTOMER settings';
        } else {
          for (const [code, patch] of Object.entries(body.number_series)) {
            const current = series.getSeries(code);
            if (!current) { errors[`number_series.${code}`] = 'Unknown number series'; continue; }
            try {
              const result = series.validateSeriesPatch(code, patch, current);
              series.applySeriesUpdate(code, result);
              seriesApplied.push(code);
            } catch (err) {
              if (!(err instanceof series.SeriesError)) throw err;
              Object.assign(errors, prefixFields(`number_series.${code}`, err.fields));
            }
          }
        }
      }

      // ---- Owner account (profile checks need the database for username uniqueness)
      let ownerOut = null;
      try {
        const existing = actorRow || { id: -1, role: OWNER_ROLE, is_active: 1 };
        ownerOut = users.validateUserInput(
          { username: owner.username, full_name: owner.full_name, ...(actorRow ? {} : { password: owner.password }) },
          { actor: { id: existing.id, role: OWNER_ROLE, permissions: [] }, existing: actorRow }
        );
      } catch (err) {
        if (!(err instanceof users.UserError)) throw err;
        Object.assign(errors, prefixFields('owner', err.fields));
      }

      if (Object.keys(errors).length) throw new SetupInvalid(errors); // rolls everything back

      // ---- Owner: convert the seeded admin in place (keeps its id and history), or create one
      let id;
      if (actorRow) {
        id = actorRow.id;
        runSync(
          `UPDATE users SET username = ?, full_name = ?, password_hash = ?, pin_hash = COALESCE(?, pin_hash),
             role = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [ownerOut.username, ownerOut.full_name, passwordHash, pinHash, OWNER_ROLE, id]
        );
      } else {
        id = users.insertUser({ out: { ...ownerOut, role: OWNER_ROLE }, passwordHash, pinHash });
      }

      runSync("UPDATE organization SET setup_completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), updated_at = CURRENT_TIMESTAMP WHERE id = 1");

      const audit = (action, entityType, entityId, newValue, oldValue = null) =>
        logAuditSync({ userId: id, userName: ownerOut.username, action, entityType, entityId, oldValue, newValue });
      audit('ORGANIZATION_UPDATE', 'organization', 1, orgChanges);
      if (licenceRows) audit('LICENCES_UPDATE', 'organization', 1, licenceRows.map(({ type, number, valid_until, print_on_bill }) => ({ type, number, valid_until, print_on_bill })));
      if (settingChanges && Object.keys(settingChanges).length) audit('SETTINGS_UPDATE', 'settings', 0, settingChanges);
      for (const code of seriesApplied) audit('NUMBER_SERIES_UPDATE', 'number_series', 0, { code, next_value: series.describe(code).next_value });
      audit('USER_UPDATE', 'user', id, { username: ownerOut.username, full_name: ownerOut.full_name, pin_set: Boolean(pinHash) },
        actorRow ? { username: actorRow.username, full_name: actorRow.full_name } : null);
      audit('SETUP_COMPLETE', 'organization', 1, { owner: ownerOut.username });
      return id;
    });
  } catch (err) {
    if (err instanceof SetupInvalid) return res.status(400).json({ error: err.message, fields: err.fields });
    if (err.status === 409) return res.status(409).json({ error: err.message });
    throw err;
  }

  // Sign the owner in, exactly like POST /api/auth/login
  runSync("UPDATE users SET last_login_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", [ownerId]);
  const user = loadSessionUser(ownerId);
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  return res.json({ token, user });
});

module.exports = router;
