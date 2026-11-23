// Phase 0 regression tests: every abuse case from docs/PRODUCT_ANALYSIS.md section 2.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { startTestServer } = require('./helpers');
const { resetLoginLimiter, MAX_FAILURES } = require('../src/middleware/loginLimiter');

let t; // test server
let admin, cashier;
let catId, offCatId, samosa, tea, disabledItem, itemInOffCat, customerId;

before(async () => {
  t = await startTestServer();
  admin = await t.login('admin', 'admin123');

  const cat = await t.call('POST', '/api/categories', { token: admin, body: { name: 'Snacks' } });
  catId = cat.body.category.id;
  const offCat = await t.call('POST', '/api/categories', { token: admin, body: { name: 'Seasonal' } });
  offCatId = offCat.body.category.id;

  samosa = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Samosa', price: 15, category_id: catId } })).body;
  tea = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Tea', price: 10.1, category_id: catId } })).body;
  disabledItem = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Old Item', price: 5, category_id: catId } })).body;
  await t.call('PATCH', `/api/items/${disabledItem.id}/status`, { token: admin, body: { is_active: false } });
  itemInOffCat = (await t.call('POST', '/api/items', { token: admin, body: { name: 'Mango Lassi', price: 40, category_id: offCatId } })).body;
  await t.call('PATCH', `/api/categories/${offCatId}/status`, { token: admin, body: { is_active: false } });

  await t.call('POST', '/api/users', {
    token: admin,
    body: { username: 'cashier1', password: 'cashier123', full_name: 'Cashier One', role: 'CASHIER' }
  });
  cashier = await t.login('cashier1', 'cashier123');

  customerId = (await t.call('POST', '/api/customers', { token: cashier, body: { name: 'Ravi', phone: '9876543210' } })).body.customer.id;
});

after(() => t.close());
beforeEach(() => resetLoginLimiter());

const order = (token, body) => t.call('POST', '/api/orders', { token, body });
const line = (item, quantity = 1) => ({ item_id: item.id, quantity });

// ---------- Authentication & network ----------

test('token signed with the old hard-coded secret is rejected', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ id: 1, username: 'admin', role: 'ADMIN', iat: Math.floor(Date.now() / 1000) });
  for (const oldSecret of ['airas_pos_offline_secret_key_2026', 'pos_project_offline_secret_key']) {
    const sig = crypto.createHmac('sha256', oldSecret).update(`${h}.${p}`).digest('base64url');
    const r = await t.call('GET', '/api/users', { token: `${h}.${p}.${sig}` });
    assert.equal(r.status, 401, `forged token with "${oldSecret}" must fail`);
  }
});

test('a random per-install secret is created next to the database', () => {
  const secretFile = path.join(path.dirname(process.env.POS_DB_PATH), '.jwt_secret');
  const secret = fs.readFileSync(secretFile, 'utf8');
  assert.match(secret, /^[0-9a-f]{96}$/);
});

test('"alg: none" tokens are rejected', async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ id: 1, username: 'admin', role: 'ADMIN' })}.`;
  assert.equal((await t.call('GET', '/api/users', { token })).status, 401);
});

test('requests from other websites are refused; local origins are allowed', async () => {
  const evil = await t.call('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);

  for (const origin of ['null', 'file://']) {
    assert.equal((await t.call('GET', '/api/health', { headers: { Origin: origin } })).status, 403, origin);
  }

  const dev = await t.call('GET', '/api/health', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(dev.status, 200);
});

test('non-loopback Host header is refused (DNS rebinding)', async () => {
  const status = await new Promise((resolve, reject) => {
    const url = new URL(t.base);
    const req = http.request(
      { host: url.hostname, port: url.port, path: '/api/health', headers: { Host: 'evil.example' } },
      (res) => { res.resume(); resolve(res.statusCode); }
    );
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 403);
});

test(`login locks a username after ${MAX_FAILURES} failures, without locking other users`, async () => {
  for (let i = 0; i < MAX_FAILURES; i++) {
    const r = await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: `wrong${i}` } });
    assert.equal(r.status, 401);
  }
  const locked = await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
  assert.equal(locked.status, 429, 'even the right password is refused while locked');
  assert.ok(Number(locked.headers.get('retry-after')) > 0);

  const other = await t.call('POST', '/api/auth/login', { body: { username: 'cashier1', password: 'cashier123' } });
  assert.equal(other.status, 200, 'other users can still log in');
});

// ---------- Billing rules ----------

test('cash bill must be fully paid', async () => {
  const zero = await order(cashier, { items: [line(samosa)], payment_method: 'CASH', cash_received: 0 });
  assert.equal(zero.status, 400);
  const short = await order(cashier, { items: [line(samosa)], payment_method: 'CASH', cash_received: 14.99 });
  assert.equal(short.status, 400);
  const exact = await order(cashier, { items: [line(samosa)], payment_method: 'CASH', cash_received: 15 });
  assert.equal(exact.status, 201);
  assert.equal(exact.body.order.change_given, 0);
});

test('money is exact to the paisa (no float drift)', async () => {
  const r = await order(cashier, {
    items: [line(tea, 3), line(samosa, 3)], payment_method: 'CASH', cash_received: 100, discount: 5
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.subtotal, 75.3);
  assert.equal(r.body.order.final_amount, 70.3);
  assert.equal(r.body.order.change_given, 29.7);
  assert.equal(r.body.items.find((i) => i.item_name === 'Tea').subtotal, 30.3);
});

test('discount can never exceed the subtotal or be negative', async () => {
  const over = await order(admin, { items: [line(samosa)], payment_method: 'UPI', discount: 9999 });
  assert.equal(over.status, 400);
  const negative = await order(admin, { items: [line(samosa)], payment_method: 'UPI', discount: -5 });
  assert.equal(negative.status, 400);
  const junk = await order(admin, { items: [line(samosa)], payment_method: 'UPI', discount: 'abc' });
  assert.equal(junk.status, 400);
});

test('cashier discount is capped by the admin setting; admin is not', async () => {
  // default cap 20%: ₹100 bill (4 x 15 + 4 x 10.10 = 100.40) -> max ₹20.08
  const items = [line(samosa, 4), line(tea, 4)];
  const over = await order(cashier, { items, payment_method: 'UPI', discount: 25 });
  assert.equal(over.status, 403);
  const ok = await order(cashier, { items, payment_method: 'UPI', discount: 20 });
  assert.equal(ok.status, 201);
  const adminBig = await order(admin, { items, payment_method: 'UPI', discount: 50 });
  assert.equal(adminBig.status, 201);

  // admin changes the cap to 50%; cashier may now give ₹25
  const set = await t.call('PUT', '/api/settings', { token: admin, body: { cashier_max_discount_pct: 50 } });
  assert.equal(set.status, 200);
  assert.equal(set.body.cashier_max_discount_pct, 50);
  assert.equal((await order(cashier, { items, payment_method: 'UPI', discount: 25 })).status, 201);
  await t.call('PUT', '/api/settings', { token: admin, body: { cashier_max_discount_pct: 20 } });
});

test('settings: cashiers cannot change them and bad values are rejected', async () => {
  assert.equal((await t.call('PUT', '/api/settings', { token: cashier, body: { cashier_max_discount_pct: 100 } })).status, 403);
  assert.equal((await t.call('PUT', '/api/settings', { token: admin, body: { cashier_max_discount_pct: 150 } })).status, 400);
  assert.equal((await t.call('PUT', '/api/settings', { token: admin, body: { unknown_key: 1 } })).status, 400);
  assert.equal((await t.call('GET', '/api/settings', { token: cashier })).body.cashier_max_discount_pct, 20);
});

test('disabled items, and items in disabled categories, cannot be billed', async () => {
  assert.equal((await order(cashier, { items: [line(disabledItem)], payment_method: 'UPI' })).status, 400);
  assert.equal((await order(cashier, { items: [line(itemInOffCat)], payment_method: 'UPI' })).status, 400);
});

test('quantity must be a whole number from 1 upward', async () => {
  for (const quantity of [2.7, 0, -1, 'abc', 100001]) {
    const r = await order(cashier, { items: [line(samosa, quantity)], payment_method: 'UPI' });
    assert.equal(r.status, 400, `quantity ${quantity}`);
  }
});

test('unknown customer is rejected instead of silently ignored', async () => {
  assert.equal((await order(cashier, { items: [line(samosa)], payment_method: 'UPI', customer_id: 99999 })).status, 400);
  const ok = await order(cashier, { items: [line(samosa)], payment_method: 'UPI', customer_id: customerId });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.order.customer_name, 'Ravi');
});

test('UPI and CARD are recorded separately; digital bills record the exact total', async () => {
  const upi = await order(cashier, { items: [line(samosa)], payment_method: 'UPI', cash_received: 500 });
  const card = await order(cashier, { items: [line(samosa)], payment_method: 'CARD' });
  assert.equal(upi.body.order.payment_method, 'UPI');
  assert.equal(upi.body.order.cash_received, 15);
  assert.equal(upi.body.order.change_given, 0);
  assert.equal(card.body.order.payment_method, 'CARD');
  assert.equal((await order(cashier, { items: [line(samosa)], payment_method: 'CHEQUE' })).status, 400);

  const cardOnly = await t.call('GET', '/api/orders?payment_method=CARD&limit=100', { token: admin });
  assert.ok(cardOnly.body.orders.every((o) => o.payment_method === 'CARD'));
});

test('voiding and un-voiding need a reason; cashiers cannot void', async () => {
  const o = (await order(cashier, { items: [line(samosa)], payment_method: 'UPI', notes: 'extra spicy' })).body.order;
  const status = (token, body) => t.call('PATCH', `/api/orders/${o.id}/status`, { token, body });

  assert.equal((await status(cashier, { status: 'VOID', reason: 'mistake' })).status, 403);
  assert.equal((await status(admin, { status: 'VOID' })).status, 400);
  assert.equal((await status(admin, { status: 'VOID', reason: '  ' })).status, 400);

  const voided = await status(admin, { status: 'VOID', reason: 'Customer cancelled' });
  assert.equal(voided.status, 200);
  assert.equal(voided.body.payment_status, 'VOID');
  assert.equal(voided.body.void_reason, 'Customer cancelled');
  assert.equal(voided.body.notes, 'extra spicy', 'order notes are kept, not overwritten');

  assert.equal((await status(admin, { status: 'VOID', reason: 'again' })).status, 400, 'already void');
  assert.equal((await status(admin, { status: 'PAID' })).status, 400, 'un-void needs a reason');
  assert.equal((await status(admin, { status: 'PAID', reason: 'Voided by mistake' })).status, 200);

  const logs = await t.call('GET', '/api/audit-logs', { token: admin });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  assert.ok(list.some((l) => l.action === 'UNVOID_ORDER'), 'un-void is audited');
});

test('reports return money rounded to 2 decimals', async () => {
  const r = await t.call('GET', '/api/reports/eod', { token: admin });
  assert.equal(r.status, 200);
  const { total_revenue, total_discounts } = r.body.summary;
  for (const v of [total_revenue, total_discounts]) {
    assert.equal(Math.round(v * 100) / 100, v);
  }
});

// ---------- Items & uploads ----------

test('item prices are validated and rounded to paise', async () => {
  assert.equal((await t.call('POST', '/api/items', { token: admin, body: { name: 'Bad', price: -1 } })).status, 400);
  assert.equal((await t.call('POST', '/api/items', { token: admin, body: { name: 'Bad', price: 'abc' } })).status, 400);
  const r = await t.call('POST', '/api/items', { token: admin, body: { name: 'Odd', price: 12.345 } });
  assert.equal(r.status, 201);
  assert.equal(r.body.price, 12.35);
  assert.equal((await t.call('PUT', `/api/items/${r.body.id}`, { token: admin, body: { price: 'x' } })).status, 400);
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

function itemForm(name, blob, filename) {
  const fd = new FormData();
  fd.append('name', name);
  fd.append('price', '5');
  fd.append('image', blob, filename);
  return fd;
}

test('uploads accept raster images only', async () => {
  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: 'image/svg+xml' });
  assert.equal((await t.call('POST', '/api/items', { token: admin, body: itemForm('Svg', svg, 'x.svg') })).status, 400);

  const html = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
  assert.equal((await t.call('POST', '/api/items', { token: admin, body: itemForm('Html', html, 'x.html') })).status, 400);

  // A PNG with a misleading .html name is stored with the extension of its real type
  const png = new Blob([PNG_1PX], { type: 'image/png' });
  const ok = await t.call('POST', '/api/items', { token: admin, body: itemForm('Pic', png, 'evil.html') });
  assert.equal(ok.status, 201);
  assert.match(ok.body.image_url, /^\/uploads\/items\/item-\d+-[0-9a-f]{12}\.png$/);

  const served = await fetch(t.base + ok.body.image_url);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');
  assert.equal(served.headers.get('x-content-type-options'), 'nosniff');
});

test('cashiers cannot create items', async () => {
  assert.equal((await t.call('POST', '/api/items', { token: cashier, body: { name: 'X', price: 1 } })).status, 403);
});
