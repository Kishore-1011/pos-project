// Phase 1 step 6: time zone, financial-year start and business-day cutoff as settings.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let t;
let admin, cashier, item;
let db, calendar, series;

before(async () => {
  t = await startTestServer();
  db = require('../src/db/database');
  calendar = require('../src/services/calendar');
  series = require('../src/services/numberSeriesService');
  admin = await t.login('admin', 'admin123');
  await t.call('POST', '/api/users', {
    token: admin, body: { username: 'cashier1', password: 'cashier123', full_name: 'Cashier', role: 'CASHIER' }
  });
  cashier = await t.login('cashier1', 'cashier123');
  item = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Tea', price: 10 } })).body;
});
after(() => t.close());

const putSettings = (body, token = admin) => t.call('PUT', '/api/settings', { token, body });

/** Insert a ₹10 paid bill at an exact instant. */
function billAt(isoUtc) {
  const { lastInsertRowid } = db.runSync(
    `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
       payment_method, payment_status, created_at) VALUES (?, ?, 1, 1000, 0, 1000, 'CASH', 'PAID', ?)`,
    [`T-${isoUtc}`, `T-${isoUtc}`, isoUtc]
  );
  db.runSync(`INSERT INTO order_items (order_id, item_id, item_name, unit_price_paise, quantity, subtotal_paise)
              VALUES (?, ?, 'Tea', 1000, 1, 1000)`, [lastInsertRowid, item.id]);
  return lastInsertRowid;
}

const eod = async (date) => (await t.call('GET', `/api/reports/eod?startDate=${date}&endDate=${date}`, { token: admin })).body;
const listCount = async (date) =>
  (await t.call('GET', `/api/orders?startDate=${date}&endDate=${date}&limit=100`, { token: admin })).body.total;

test('defaults: Asia/Kolkata, FY from April, day starts at midnight; every user can read them', async () => {
  const r = await t.call('GET', '/api/settings', { token: cashier });
  assert.equal(r.status, 200);
  assert.equal(r.body.time_zone, 'Asia/Kolkata');
  assert.equal(r.body.fy_start_month, 4);
  assert.equal(r.body.business_day_cutoff, '00:00');
  assert.match(r.body.calendar.business_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(r.body.calendar.financial_year.label, /^\d{2}-\d{2}$/);
  assert.match(r.body.calendar.financial_year.start_date, /-04-01$/);
  assert.match(r.body.calendar.financial_year.end_date, /-03-31$/);
});

test('invalid values are rejected and nothing is saved', async () => {
  for (const body of [
    { time_zone: 'Mars/Olympus' },
    { time_zone: '' },
    { fy_start_month: 13 },
    { fy_start_month: 4.5 },
    { business_day_cutoff: '07:00' },
    { business_day_cutoff: '2:00' },
    { business_day_cutoff: '25:00' },
    { time_zone: 'Asia/Dubai', business_day_cutoff: 'late' } // one bad key -> whole update refused
  ]) {
    const r = await putSettings(body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
  assert.equal((await t.call('GET', '/api/settings', { token: admin })).body.time_zone, 'Asia/Kolkata');
  assert.equal((await putSettings({ time_zone: 'Asia/Dubai' }, cashier)).status, 403);
});

test('FY start month can be changed before the first bill; numbering follows it', async () => {
  let r = await putSettings({ fy_start_month: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { year } = calendar.localDateParts();
  assert.equal(series.peekNext('INVOICE').value, `INV/${year}/0001`, 'January start: FY is the calendar year');
  assert.equal(r.body.calendar.financial_year.start_date, `${year}-01-01`);

  r = await putSettings({ fy_start_month: 4 });
  assert.equal(r.status, 200);
  assert.match(series.peekNext('INVOICE').value, /^INV\/\d{2}-\d{2}\/0001$/);
});

test('FY start month is locked once billing has started', async () => {
  const b = await t.call('POST', '/api/orders', {
    token: cashier, body: { items: [{ item_id: item.id, quantity: 1 }], payment_method: 'UPI' }
  });
  assert.equal(b.status, 201);
  const r = await putSettings({ fy_start_month: 1 });
  assert.equal(r.status, 409);
  assert.match(r.body.error, /before the first bill/);
  assert.equal((await putSettings({ fy_start_month: 4 })).status, 200, 're-saving the same value is fine');
});

test('business-day cutoff: a 01:30 bill counts in the previous day', async () => {
  billAt('2026-11-24T20:00:00.000Z'); // 01:30 IST on 25 Nov

  // Midnight cutoff: it belongs to 25 Nov
  assert.equal((await eod('2026-11-25')).summary.paid_orders_count, 1);
  assert.equal((await eod('2026-11-24')).summary.paid_orders_count, 0);

  // 02:00 cutoff: it belongs to 24 Nov — in the report, its daily row, and the invoice list
  assert.equal((await putSettings({ business_day_cutoff: '02:00' })).status, 200);
  const day = await eod('2026-11-24');
  assert.equal(day.summary.paid_orders_count, 1);
  assert.equal(day.summary.total_revenue, 10);
  assert.deepEqual(day.dailyBreakdown.map((d) => [d.date, d.paid_orders_count]), [['2026-11-24', 1]]);
  assert.equal((await eod('2026-11-25')).summary.paid_orders_count, 0);
  assert.equal(await listCount('2026-11-24'), 1);
  assert.equal(await listCount('2026-11-25'), 0);

  // A bill at 02:00 exactly starts the new business day
  billAt('2026-11-24T20:30:00.000Z'); // 02:00 IST on 25 Nov
  assert.equal((await eod('2026-11-25')).summary.paid_orders_count, 1);

  await putSettings({ business_day_cutoff: '00:00' });
});

test('invoice financial year uses the real date, not the business day', async () => {
  await putSettings({ business_day_cutoff: '02:00' });
  const at = new Date('2030-03-31T19:00:00.000Z'); // 00:30 IST on 1 April 2030
  assert.equal(calendar.businessDate(at), '2030-03-31', 'counts in 31 March reports');
  assert.equal(db.transaction(() => series.allocate('INVOICE', at)), 'INV/30-31/0001', 'but the invoice is dated 1 April (new FY)');
  await putSettings({ business_day_cutoff: '00:00' });
});

test('time zone setting decides which day a bill belongs to', async () => {
  billAt('2026-11-27T19:00:00.000Z'); // 00:30 IST on 28 Nov = 23:00 Dubai on 27 Nov

  assert.equal((await eod('2026-11-28')).summary.paid_orders_count, 1, 'India: 28 Nov');
  assert.equal((await putSettings({ time_zone: 'Asia/Dubai' })).status, 200);
  assert.equal((await eod('2026-11-27')).summary.paid_orders_count, 1, 'Dubai: 27 Nov');
  assert.equal((await eod('2026-11-28')).summary.paid_orders_count, 0);
  assert.equal(await listCount('2026-11-27'), 1);
  await putSettings({ time_zone: 'Asia/Kolkata' });
});

test('date ranges are exact UTC bounds, correct even across daylight-saving changes', async () => {
  let r = calendar.businessRangeUtc('2026-11-24', '2026-11-24');
  assert.deepEqual(r, { from: '2026-11-23T18:30:00.000Z', to: '2026-11-24T18:30:00.000Z' });

  await putSettings({ time_zone: 'Europe/London' });
  r = calendar.businessRangeUtc('2026-03-29', '2026-03-29'); // clocks go forward: a 23-hour day
  assert.equal((Date.parse(r.to) - Date.parse(r.from)) / 3600000, 23);
  await putSettings({ time_zone: 'Asia/Kolkata' });
});

test('bad report dates are rejected', async () => {
  assert.equal((await t.call('GET', '/api/reports/eod?startDate=2026-02-30', { token: admin })).status, 400);
  assert.equal((await t.call('GET', '/api/reports/eod?startDate=24-11-2026', { token: admin })).status, 400);
  assert.equal((await t.call('GET', '/api/reports/eod?startDate=2026-11-25&endDate=2026-11-24', { token: admin })).status, 400);
  assert.equal((await t.call('GET', '/api/orders?startDate=nope', { token: admin })).status, 400);
});

test('bill times are always stored in one sortable format, even if inserted the old way', () => {
  const { lastInsertRowid } = db.runSync(
    `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
       payment_method, payment_status, created_at) VALUES ('OLD', 'OLD', 1, 0, 0, 0, 'CASH', 'PAID', '2026-11-20 07:00:00')`
  );
  assert.equal(db.getSync('SELECT created_at FROM orders WHERE id = ?', [lastInsertRowid]).created_at, '2026-11-20T07:00:00.000Z');
  const { lastInsertRowid: id2 } = db.runSync(
    `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
       payment_method, payment_status) VALUES ('DEF', 'DEF', 1, 0, 0, 0, 'CASH', 'PAID')`
  );
  assert.match(db.getSync('SELECT created_at FROM orders WHERE id = ?', [id2]).created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
});

test('settings changes are audited', async () => {
  const logs = await t.call('GET', '/api/audit-logs', { token: admin });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  assert.ok(list.filter((l) => l.action === 'SETTINGS_UPDATE').length >= 5);
});
