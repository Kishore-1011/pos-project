// Phase 1 step 5: number series engine (invoice & customer), financial-year resets, GST rules.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let t;
let admin, cashier, item;
let series, calendar, db;

// Instants around an Indian financial-year boundary (IST = UTC+05:30), in a year no other test uses
const MAR31_2359_IST = new Date('2030-03-31T18:29:00Z');
const APR01_0001_IST = new Date('2030-03-31T18:31:00Z'); // still 31 March in UTC!

before(async () => {
  t = await startTestServer();
  series = require('../src/services/numberSeriesService');
  calendar = require('../src/services/calendar');
  db = require('../src/db/database');
  admin = await t.login('admin', 'admin123');
  await t.call('POST', '/api/users', {
    token: admin, body: { username: 'cashier1', password: 'cashier123', full_name: 'Cashier', role: 'CASHIER' }
  });
  cashier = await t.login('cashier1', 'cashier123');
  item = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Tea', price: 10 } })).body;
});
after(() => t.close());

const fyNow = () => calendar.financialYear(calendar.localDateParts()).short;
const bill = (token = cashier) => t.call('POST', '/api/orders', {
  token, body: { items: [{ item_id: item.id, quantity: 1 }], payment_method: 'UPI' }
});
const putSeries = (code, body, token = admin) => t.call('PUT', `/api/number-series/${code}`, { token, body });
const allocateAt = (code, date) => db.transaction(() => series.allocate(code, date));

test('financial year follows the shop time zone, not UTC', () => {
  assert.deepEqual(calendar.localDateParts(APR01_0001_IST), { year: 2030, month: 4, day: 1 });
  assert.equal(calendar.financialYear(calendar.localDateParts(MAR31_2359_IST)).short, '29-30');
  assert.equal(calendar.financialYear(calendar.localDateParts(APR01_0001_IST)).short, '30-31');
  assert.equal(calendar.financialYear({ year: 2026, month: 1 }).key, '2025-26');
  assert.equal(calendar.financialYear({ year: 2099, month: 4 }).short, '99-00', 'century wrap');
  assert.equal(calendar.financialYear({ year: 2026, month: 6 }, 1).short, '2026', 'January-start FY = calendar year');
});

test('defaults: invoices INV/<FY>/0001, customers CUST-0001', async () => {
  const r = await t.call('GET', '/api/number-series', { token: admin });
  assert.equal(r.status, 200);
  const inv = r.body.series.find((s) => s.code === 'INVOICE');
  const cust = r.body.series.find((s) => s.code === 'CUSTOMER');
  assert.equal(inv.next_value, `INV/${fyNow()}/0001`);
  assert.equal(inv.reset_policy, 'FINANCIAL_YEAR');
  assert.equal(cust.next_value, 'CUST-0001');

  const b = await bill();
  assert.equal(b.body.invoice_no, `INV/${fyNow()}/0001`);
  const c = await t.call('POST', '/api/customers', { token: cashier, body: { name: 'Asha', phone: '9000000001' } });
  assert.equal(c.body.customer.customer_code, 'CUST-0001');
});

test('cashiers cannot see or change number series', async () => {
  assert.equal((await t.call('GET', '/api/number-series', { token: cashier })).status, 403);
  assert.equal((await putSeries('INVOICE', { prefix: 'X' }, cashier)).status, 403);
  assert.equal((await putSeries('NOPE', { prefix: 'X' })).status, 404);
});

test('invoice numbers restart at 0001 on 1 April (IST midnight), and never repeat', () => {
  const a = allocateAt('INVOICE', MAR31_2359_IST);
  const b = allocateAt('INVOICE', MAR31_2359_IST);
  const c = allocateAt('INVOICE', APR01_0001_IST);
  const d = allocateAt('INVOICE', APR01_0001_IST);
  assert.deepEqual([a, b], ['INV/29-30/0001', 'INV/29-30/0002']);
  assert.deepEqual([c, d], ['INV/30-31/0001', 'INV/30-31/0002']);
  // Back in the old FY (e.g. a late entry) continues that year's sequence
  assert.equal(allocateAt('INVOICE', MAR31_2359_IST), 'INV/29-30/0003');
});

test('format validation: allowed characters, GST 16-character limit, period required when resetting', async () => {
  let r = await putSeries('INVOICE', { prefix: 'INV#', suffix: 'A B' });
  assert.equal(r.status, 400);
  assert.ok(r.body.fields.prefix && r.body.fields.suffix);

  r = await putSeries('INVOICE', { prefix: 'SHOPNAME', padding: 6 }); // SHOPNAME/25-26/000001 = 21 chars
  assert.equal(r.status, 400);
  assert.match(r.body.fields.prefix, /16 characters/);

  r = await putSeries('INVOICE', { include_period: false });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.include_period, /repeat/);

  r = await putSeries('INVOICE', { padding: 0 });
  assert.equal(r.status, 400);
  r = await putSeries('INVOICE', { reset_policy: 'WEEKLY' });
  assert.equal(r.status, 400);
  r = await putSeries('INVOICE', { separator: '_' });
  assert.equal(r.status, 400);

  // Customer codes have no 16-character rule
  r = await putSeries('CUSTOMER', { prefix: 'LOYALTY', padding: 8 });
  assert.equal(r.status, 200);
  await putSeries('CUSTOMER', { prefix: 'CUST', padding: 4 });
});

test('preview shows the next number without saving anything', async () => {
  const before = (await t.call('GET', '/api/number-series', { token: admin })).body.series.find((s) => s.code === 'INVOICE');
  const p = await t.call('POST', '/api/number-series/INVOICE/preview', {
    token: admin, body: { prefix: 'GB', separator: '-', reset_policy: 'MONTHLY' }
  });
  assert.equal(p.status, 200);
  const { year, month } = calendar.localDateParts();
  assert.equal(p.body.preview, `GB-${String(year % 100).padStart(2, '0')}${String(month).padStart(2, '0')}-0001`);

  const bad = await t.call('POST', '/api/number-series/INVOICE/preview', { token: admin, body: { include_period: false } });
  assert.equal(bad.status, 400);

  const afterSeries = (await t.call('GET', '/api/number-series', { token: admin })).body.series.find((s) => s.code === 'INVOICE');
  assert.equal(afterSeries.next_value, before.next_value, 'preview did not change anything');
});

test('changing the format applies to the next bill and is audited', async () => {
  const r = await putSeries('INVOICE', { prefix: 'GB', separator: '-' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.match(r.body.series.next_value, new RegExp(`^GB-${fyNow()}-\\d{4}$`));
  const b = await bill();
  assert.equal(b.body.invoice_no, r.body.series.next_value);

  const logs = await t.call('GET', '/api/audit-logs', { token: admin });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  assert.ok(list.some((l) => l.action === 'NUMBER_SERIES_UPDATE'));
  await putSeries('INVOICE', { prefix: 'INV', separator: '/' });
});

test('next number can move forward (e.g. continuing from an old billing book) but never back', async () => {
  let r = await putSeries('INVOICE', { next_number: 457 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.series.next_value, `INV/${fyNow()}/0457`);
  assert.equal((await bill()).body.invoice_no, `INV/${fyNow()}/0457`);

  r = await putSeries('INVOICE', { next_number: 100 });
  assert.equal(r.status, 400);
  assert.match(r.body.fields.next_number, /at least 458/);
});

test('numbers already used (e.g. imported bills) are skipped, never duplicated', async () => {
  const fy = fyNow();
  // Someone imported bills 0458 and 0459 directly
  for (const n of ['0458', '0459']) {
    db.runSync(
      `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
         payment_method, payment_status) VALUES (?, ?, 1, 100, 0, 100, 'CASH', 'PAID')`,
      [`IMP-${n}`, `INV/${fy}/${n}`]
    );
  }
  assert.equal((await bill()).body.invoice_no, `INV/${fy}/0460`);
});

test('50 bills at the same moment get 50 distinct, consecutive numbers', async () => {
  const results = await Promise.all(Array.from({ length: 50 }, () => bill()));
  assert.ok(results.every((r) => r.status === 201));
  const nums = results.map((r) => Number(r.body.invoice_no.split('/').pop())).sort((a, b) => a - b);
  assert.equal(new Set(nums).size, 50);
  assert.equal(nums[49] - nums[0], 49, 'no gaps');
});

test('yearly, monthly and daily resets each start again at 0001', () => {
  db.transaction(() => {
    series.applySeriesUpdate('CUSTOMER', series.validateSeriesPatch('CUSTOMER',
      { reset_policy: 'DAILY', include_period: true, prefix: 'C', separator: '-', padding: 3 }, series.getSeries('CUSTOMER')));
  });
  const d1 = new Date('2026-11-23T06:00:00Z');
  const d2 = new Date('2026-11-24T06:00:00Z');
  assert.equal(allocateAt('CUSTOMER', d1), 'C-261123-001');
  assert.equal(allocateAt('CUSTOMER', d1), 'C-261123-002');
  assert.equal(allocateAt('CUSTOMER', d2), 'C-261124-001');

  db.transaction(() => {
    series.applySeriesUpdate('CUSTOMER', series.validateSeriesPatch('CUSTOMER', { reset_policy: 'MONTHLY' }, series.getSeries('CUSTOMER')));
  });
  assert.equal(allocateAt('CUSTOMER', d1), 'C-2611-001');
  assert.equal(allocateAt('CUSTOMER', new Date('2026-12-01T06:00:00Z')), 'C-2612-001');

  db.transaction(() => {
    series.applySeriesUpdate('CUSTOMER', series.validateSeriesPatch('CUSTOMER', { reset_policy: 'YEARLY' }, series.getSeries('CUSTOMER')));
  });
  assert.equal(allocateAt('CUSTOMER', d1), 'C-2026-001');
  assert.equal(allocateAt('CUSTOMER', new Date('2027-01-01T06:00:00Z')), 'C-2027-001');
});

test('a failed save does not use up a number', async () => {
  const before = series.peekNext('INVOICE').value;
  const r = await t.call('POST', '/api/orders', {
    token: cashier, body: { items: [{ item_id: item.id, quantity: 1 }], payment_method: 'CASH', cash_received: 0 }
  });
  assert.equal(r.status, 400);
  assert.equal(series.peekNext('INVOICE').value, before);
});
