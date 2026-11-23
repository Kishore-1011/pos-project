// Phase 1 steps 3–4: organization profile, GST registration, licences, logo.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const { gstinCheckChar, gstinError } = require('../src/utils/india');

let t;
let admin, cashier;

before(async () => {
  t = await startTestServer();
  admin = await t.login('admin', 'admin123');
  await t.call('POST', '/api/users', {
    token: admin,
    body: { username: 'cashier1', password: 'cashier123', full_name: 'Cashier One', role: 'CASHIER' }
  });
  cashier = await t.login('cashier1', 'cashier123');
});
after(() => t.close());

const getOrg = (token = admin) => t.call('GET', '/api/organization', { token });
const putOrg = (body, token = admin) => t.call('PUT', '/api/organization', { token, body });
const putLicences = (licences, token = admin) => t.call('PUT', '/api/organization/licences', { token, body: { licences } });

// Standard sample GSTIN (Maharashtra) and a valid one built for Karnataka with a computed check char
const GSTIN_MH = '27AAPFU0939F1ZV';
const GSTIN_KA = (() => { const b = '29ABCDE1234F1Z'; return b + gstinCheckChar(b); })();

test('GSTIN validator: format, state code and check digit', () => {
  assert.equal(gstinError(GSTIN_MH), null);
  assert.equal(gstinError(GSTIN_KA), null);
  assert.match(gstinError('27AAPFU0939F1ZX'), /check digit/);
  assert.match(gstinError('99AAPFU0939F1ZV'), /state code/);
  assert.match(gstinError('27AAPFU0939F1Z'), /15 characters/);
  assert.match(gstinError('27aapfu0939f1zv'.toUpperCase().replace('Z', 'Y')), /format/);
});

test('fresh install: empty unregistered profile with setup hints and option lists', async () => {
  const r = await getOrg(cashier);
  assert.equal(r.status, 200, 'all staff can read the shop profile');
  assert.equal(r.body.organization.gst_registration_type, 'UNREGISTERED');
  assert.deepEqual(r.body.organization.business_types, []);
  assert.deepEqual(r.body.licences, []);
  assert.ok(r.body.warnings.some((w) => w.code === 'NAME_MISSING'));
  assert.ok(r.body.options.states.some((s) => s.code === '33' && s.name === 'Tamil Nadu'));
  assert.ok(!r.body.options.states.some((s) => s.code === '25' || s.code === '28'), 'retired codes not offered');
  assert.deepEqual(r.body.options.business_types, ['FOOD', 'RETAIL', 'SERVICES']);
});

test('only admins can change the profile, licences or logo', async () => {
  assert.equal((await putOrg({ legal_name: 'X' }, cashier)).status, 403);
  assert.equal((await putLicences([], cashier)).status, 403);
  assert.equal((await t.call('DELETE', '/api/organization/logo', { token: cashier })).status, 403);
});

test('profile fields are validated with per-field messages', async () => {
  const r = await putOrg({
    legal_name: 'x'.repeat(121),
    pincode: '012345',
    phone: '12345',
    email: 'not-an-email',
    state_code: '99',
    business_types: ['FOOD', 'BAKERY'],
    unknown_field: 1
  });
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields).sort(),
    ['business_types', 'email', 'legal_name', 'phone', 'pincode', 'state_code', 'unknown_field']);
  assert.equal((await getOrg()).body.organization.legal_name, '', 'nothing saved when any field is invalid');
});

test('saving a valid profile trims, normalizes and audits changes', async () => {
  const r = await putOrg({
    legal_name: '  Sri Ganesh Foods Pvt Ltd ',
    trade_name: 'Ganesh Bhavan',
    address_line1: '12, Gandhi Road',
    city: 'Chennai',
    state_code: '33',
    pincode: '600017',
    phone: '+91 98765 43210',
    email: 'Owner@Ganesh.IN',
    business_types: ['RETAIL', 'FOOD', 'FOOD']
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const o = r.body.organization;
  assert.equal(o.legal_name, 'Sri Ganesh Foods Pvt Ltd');
  assert.equal(o.email, 'owner@ganesh.in');
  assert.deepEqual(o.business_types, ['FOOD', 'RETAIL']);
  assert.ok(!r.body.warnings.some((w) => w.code === 'NAME_MISSING'));

  const logs = await t.call('GET', '/api/audit-logs', { token: admin });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  const entry = list.find((l) => l.action === 'ORGANIZATION_UPDATE');
  assert.ok(entry, 'audited');
  const newValue = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
  assert.equal(newValue.city, 'Chennai');
});

test('GST registration rules: GSTIN required, valid, and consistent with state and PAN', async () => {
  // Registered without GSTIN
  let r = await putOrg({ gst_registration_type: 'REGULAR' });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.gstin, /required/);

  // Typo in check digit
  r = await putOrg({ gst_registration_type: 'REGULAR', gstin: '33AAPFU0939F1ZV' });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.gstin, /check digit/);

  // GSTIN from another state than the address (shop is in Tamil Nadu, 33)
  r = await putOrg({ gst_registration_type: 'REGULAR', gstin: GSTIN_KA });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.state_code, /Karnataka/);

  // PAN that doesn't match GSTIN
  r = await putOrg({ gst_registration_type: 'REGULAR', gstin: GSTIN_KA, state_code: '29', pan: 'ZZZZZ9999Z' });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.pan, /ABCDE1234F/);

  // Valid: lower-case with spaces is normalized, PAN is filled in from the GSTIN
  const tnBase = '33AAPFU0939F1Z';
  const gstinTN = tnBase + gstinCheckChar(tnBase);
  r = await putOrg({ gst_registration_type: 'composition', gstin: ` ${gstinTN.toLowerCase().slice(0, 5)} ${gstinTN.toLowerCase().slice(5)}` });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.organization.gstin, gstinTN);
  assert.equal(r.body.organization.pan, 'AAPFU0939F');
  assert.equal(r.body.organization.gst_registration_type, 'COMPOSITION');

  // Can't go back to unregistered while a GSTIN is set; clearing both together works
  r = await putOrg({ gst_registration_type: 'UNREGISTERED' });
  assert.equal(r.status, 400);
  r = await putOrg({ gst_registration_type: 'UNREGISTERED', gstin: '', pan: '' });
  assert.equal(r.status, 200);
  assert.equal(r.body.organization.gstin, null);
  r = await putOrg({ gst_registration_type: 'REGULAR', gstin: gstinTN });
  assert.equal(r.status, 200);
});

test('state is filled in from the GSTIN when not set', async () => {
  await putOrg({ gst_registration_type: 'UNREGISTERED', gstin: '', pan: '', state_code: '' });
  const r = await putOrg({ gst_registration_type: 'REGULAR', gstin: GSTIN_MH });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.organization.state_code, '27');
});

test('food business without FSSAI gets a warning; adding one clears it', async () => {
  let r = await getOrg();
  assert.ok(r.body.warnings.some((w) => w.code === 'FSSAI_MISSING'));

  r = await putLicences([{ type: 'FSSAI', number: '1241 9999 0001 23' }]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.licences[0].number, '12419999000123', 'spaces removed');
  assert.equal(r.body.licences[0].label, 'FSSAI Lic. No.', 'default label');
  assert.equal(r.body.licences[0].print_on_bill, true);
  assert.ok(!r.body.warnings.some((w) => w.code === 'FSSAI_MISSING'));
});

test('retail or services only: FSSAI is not required', async () => {
  await putLicences([]);
  const r = await putOrg({ business_types: ['RETAIL', 'SERVICES'] });
  assert.ok(!r.body.warnings.some((w) => w.code === 'FSSAI_MISSING'));
  await putOrg({ business_types: ['FOOD', 'RETAIL'] });
});

test('licence list is validated and replaced as a whole', async () => {
  let r = await putLicences([
    { type: 'FSSAI', number: '123' },
    { type: 'OTHER', number: 'ABC-1' },
    { type: 'BOGUS', number: '1' },
    { type: 'TRADE', number: 'T-1', valid_until: '31/12/2026' },
    { type: 'DRUG', number: '' }
  ]);
  assert.equal(r.status, 400);
  assert.deepEqual(Object.keys(r.body.fields).sort(),
    ['licences[0]', 'licences[1]', 'licences[2]', 'licences[3]', 'licences[4]']);

  r = await putLicences([{ type: 'TRADE', number: 'T-1' }, { type: 'TRADE', number: 'T-1' }]);
  assert.equal(r.status, 400, 'duplicates rejected');

  r = await putLicences([
    { type: 'FSSAI', number: '12419999000123' },
    { type: 'DRUG', number: 'TN/CHN/20B/1234', print_on_bill: false },
    { type: 'OTHER', label: 'Labour Reg.', number: 'LR-77' }
  ]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.licences.map((l) => [l.type, l.label, l.print_on_bill]), [
    ['FSSAI', 'FSSAI Lic. No.', true],
    ['DRUG', 'D.L. No.', false],
    ['OTHER', 'Labour Reg.', true]
  ]);

  r = await putLicences([{ type: 'FSSAI', number: '12419999000123' }]);
  assert.equal(r.body.licences.length, 1, 'replace-all');
});

test('expired and soon-to-expire licences are flagged', async () => {
  const inDays = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const r = await putLicences([
    { type: 'FSSAI', number: '12419999000123', valid_until: inDays(10) },
    { type: 'TRADE', number: 'T-9', valid_until: inDays(-5) },
    { type: 'SHOP_ESTABLISHMENT', number: 'SE-1', valid_until: inDays(200) }
  ]);
  const codes = r.body.warnings.map((w) => w.code);
  assert.ok(codes.includes('LICENCE_EXPIRING'));
  assert.ok(codes.includes('LICENCE_EXPIRED'));
  assert.equal(codes.filter((c) => c.startsWith('LICENCE_')).length, 2, 'far-off expiry not flagged');
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const logoForm = (blob, name) => { const fd = new FormData(); fd.append('logo', blob, name); return fd; };

test('logo upload: images only, replaces the old file, can be removed', async () => {
  const svg = new Blob(['<svg/>'], { type: 'image/svg+xml' });
  assert.equal((await t.call('POST', '/api/organization/logo', { token: admin, body: logoForm(svg, 'l.svg') })).status, 400);

  const png = new Blob([PNG_1PX], { type: 'image/png' });
  const first = await t.call('POST', '/api/organization/logo', { token: admin, body: logoForm(png, 'logo.png') });
  assert.equal(first.status, 200);
  const url1 = first.body.organization.logo_url;
  assert.match(url1, /^\/uploads\/branding\/logo-\d+-[0-9a-f]{12}\.png$/);
  assert.equal((await fetch(t.base + url1)).status, 200);

  const second = await t.call('POST', '/api/organization/logo', { token: admin, body: logoForm(png, 'logo2.png') });
  const url2 = second.body.organization.logo_url;
  assert.notEqual(url2, url1);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await fetch(t.base + url1)).status, 404, 'old logo file removed');

  const removed = await t.call('DELETE', '/api/organization/logo', { token: admin });
  assert.equal(removed.body.organization.logo_url, null);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal((await fetch(t.base + url2)).status, 404);
});

test('item photo uploads still work after moving to the shared uploader', async () => {
  const fd = new FormData();
  fd.append('name', 'Pic Item');
  fd.append('price', '10');
  fd.append('image', new Blob([PNG_1PX], { type: 'image/png' }), 'p.png');
  const r = await t.call('POST', '/api/items', { token: admin, body: fd });
  assert.equal(r.status, 201);
  assert.match(r.body.image_url, /^\/uploads\/items\/item-/);
  assert.equal((await fetch(t.base + r.body.image_url)).status, 200);
});
