// Phase 2: first-run setup API and receipt settings.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const { gstinCheckChar } = require('../src/utils/india');
const { resetLoginLimiter } = require('../src/middleware/loginLimiter');

let t;
before(async () => { t = await startTestServer(); });
after(() => t.close());
beforeEach(() => resetLoginLimiter());

const GSTIN_TN = (() => { const b = '33AAPFU0939F1Z'; return b + gstinCheckChar(b); })();
const status = () => t.call('GET', '/api/setup/status');
const complete = (body) => t.call('POST', '/api/setup/complete', { body });

const validBody = () => ({
  organization: {
    legal_name: 'Sri Ganesh Foods Pvt Ltd', trade_name: 'Ganesh Bhavan', address_line1: '12, Gandhi Road', address_line2: '',
    city: 'Chennai', state_code: '33', pincode: '600017', phone: '9876543210', email: 'owner@ganesh.in',
    business_types: ['FOOD', 'RETAIL'], gst_registration_type: 'REGULAR', gstin: GSTIN_TN, pan: ''
  },
  licences: [{ type: 'FSSAI', number: '12419999000123' }],
  number_series: {
    INVOICE: { prefix: 'GB', separator: '/', include_period: true, padding: 4, suffix: '', reset_policy: 'FINANCIAL_YEAR' },
    CUSTOMER: { prefix: 'C', separator: '-', include_period: false, padding: 5, suffix: '', reset_policy: 'NEVER' }
  },
  settings: { time_zone: 'Asia/Kolkata', fy_start_month: 4, business_day_cutoff: '01:00', receipt_width: '80mm', receipt_footer: '  Visit again!  ' },
  owner: { full_name: 'Meera Krishnan', username: 'meera', password: 'owner-secret-1', pin: '2468' }
});

test('fresh install: setup is required; no login needed to ask', async () => {
  const r = await status();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { setup_required: true, product_name: 'POS Project' });
});

test('invalid input: every problem reported with its section prefix, nothing saved', async () => {
  const body = validBody();
  body.organization.gstin = '33AAPFU0939F1ZX'; // wrong check digit
  body.licences = [{ type: 'FSSAI', number: '123' }];
  body.number_series.INVOICE.prefix = 'G B';
  body.settings.time_zone = 'Mars/Base';
  body.owner.password = '123';
  body.owner.pin = '12';
  const r = await complete(body);
  assert.equal(r.status, 400);
  for (const key of ['organization.gstin', 'licences[0]', 'settings.time_zone', 'owner.password', 'owner.pin']) {
    assert.ok(r.body.fields[key], `missing ${key}: ${JSON.stringify(r.body.fields)}`);
  }

  // Organization errors stop before later sections are applied, so check series separately
  const b2 = validBody();
  b2.number_series.INVOICE.prefix = 'G B';
  const r2 = await complete(b2);
  assert.equal(r2.status, 400);
  assert.ok(r2.body.fields['number_series.INVOICE.prefix'], JSON.stringify(r2.body.fields));

  // Nothing was saved
  assert.equal((await status()).body.setup_required, true);
  const admin = await t.login('admin', 'admin123');
  const org = await t.call('GET', '/api/organization', { token: admin });
  assert.equal(org.body.organization.legal_name, '');
  assert.deepEqual(org.body.licences, []);
  const settings = await t.call('GET', '/api/settings', { token: admin });
  assert.equal(settings.body.receipt_width, '58mm');
  assert.equal(settings.body.business_day_cutoff, '00:00');
});

test('business name, business type and owner details are required', async () => {
  const r = await complete({ organization: { gst_registration_type: 'UNREGISTERED' }, owner: {} });
  assert.equal(r.status, 400);
  for (const key of ['organization.legal_name', 'organization.business_types', 'owner.username', 'owner.full_name', 'owner.password']) {
    assert.ok(r.body.fields[key], `missing ${key}: ${JSON.stringify(r.body.fields)}`);
  }
  assert.ok((await complete({})).body.fields.organization);
});

test('GST rules for the invoice series follow the registration chosen in the same request', async () => {
  const body = validBody();
  body.number_series.INVOICE.prefix = 'GANESHBV'; // GANESHBV/26-27/0001 = 19 characters > 16
  const r = await complete(body);
  assert.equal(r.status, 400);
  assert.match(r.body.fields['number_series.INVOICE.prefix'], /GST/);

  body.organization.gst_registration_type = 'UNREGISTERED';
  body.organization.gstin = '';
  body.organization.pan = '';
  // Unregistered: the same prefix is fine — but don't complete setup here (later tests need it open)
  const svc = require('../src/services/numberSeriesService');
  assert.equal(svc.gstRulesApply(), false, 'the failed request did not leave the GST registration saved');
});

test('setup completes in one step and signs the new owner in', async () => {
  const adminBefore = (await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } })).body.user;

  const r = await complete(validBody());
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  assert.equal(r.body.user.username, 'meera');
  assert.equal(r.body.user.full_name, 'Meera Krishnan');
  assert.equal(r.body.user.role, 'OWNER');
  assert.equal(r.body.user.id, adminBefore.id, 'the seeded admin account was converted in place');
  assert.equal(r.body.user.has_pin, true);
  assert.equal(r.body.user.permissions.length, 14);

  assert.equal((await status()).body.setup_required, false);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'meera', password: 'owner-secret-1' } })).status, 200);
  assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'meera', pin: '2468' } })).status, 200);

  const token = r.body.token;
  const org = await t.call('GET', '/api/organization', { token });
  assert.equal(org.body.organization.trade_name, 'Ganesh Bhavan');
  assert.equal(org.body.organization.gstin, GSTIN_TN);
  assert.equal(org.body.organization.pan, 'AAPFU0939F', 'PAN filled in from the GSTIN');
  assert.deepEqual(org.body.organization.business_types, ['FOOD', 'RETAIL']);
  assert.equal(org.body.licences[0].number, '12419999000123');
  assert.ok(org.body.organization.setup_completed_at);

  const settings = await t.call('GET', '/api/settings', { token });
  assert.equal(settings.body.receipt_width, '80mm');
  assert.equal(settings.body.receipt_footer, 'Visit again!');
  assert.equal(settings.body.business_day_cutoff, '01:00');

  const seriesList = (await t.call('GET', '/api/number-series', { token })).body.series;
  const fy = require('../src/services/calendar').financialYear(require('../src/services/calendar').localDateParts()).short;
  assert.equal(seriesList.find((s) => s.code === 'INVOICE').next_value, `GB/${fy}/0001`);
  assert.equal(seriesList.find((s) => s.code === 'CUSTOMER').next_value, 'C-00001');

  const logs = await t.call('GET', '/api/audit-logs', { token });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  assert.ok(list.some((l) => l.action === 'SETUP_COMPLETE'));
});

test('setup cannot be run twice', async () => {
  const r = await complete(validBody());
  assert.equal(r.status, 409);
  assert.match(r.body.error, /already been completed/);
});

test('receipt settings: defaults, validation, saving', async () => {
  const token = await t.login('meera', 'owner-secret-1');
  const put = (body) => t.call('PUT', '/api/settings', { token, body });
  for (const body of [
    { receipt_width: '70mm' }, { receipt_footer: 'x'.repeat(201) }, { receipt_footer: 42 },
    { receipt_show_gstin: 'yes' }, { receipt_show_licences: 1 }, { receipt_show_customer: null }
  ]) {
    assert.equal((await put(body)).status, 400, JSON.stringify(body));
  }
  const r = await put({ receipt_width: '58mm', receipt_show_gstin: false, receipt_show_licences: 'false', receipt_show_customer: true, receipt_footer: '' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.receipt_width, '58mm');
  assert.equal(r.body.receipt_show_gstin, false);
  assert.equal(r.body.receipt_show_licences, false);
  assert.equal(r.body.receipt_show_customer, true);
  assert.equal(r.body.receipt_footer, '');
});
