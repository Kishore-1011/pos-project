// Phase 1 step 8: price change at billing (data side).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let t;
let owner, manager, cashier;
let fixed, openPrice;

before(async () => {
  t = await startTestServer();
  owner = await t.login('admin', 'admin123');
  for (const [username, role] of [['manager1', 'MANAGER'], ['cashier1', 'CASHIER']]) {
    await t.call('POST', '/api/users', { token: owner, body: { username, password: 'secret123', full_name: username, role } });
  }
  manager = await t.login('manager1', 'secret123');
  cashier = await t.login('cashier1', 'secret123');
  fixed = (await t.call('POST', '/api/items', { token: owner, body: { name: 'Tea', price: 10 } })).body;
  openPrice = (await t.call('POST', '/api/items', {
    token: owner, body: { name: 'Repair Service', price: 500, allow_price_change: true }
  })).body;
});
after(() => t.close());

const bill = (token, lines, extra = {}) =>
  t.call('POST', '/api/orders', { token, body: { items: lines, payment_method: 'UPI', ...extra } });

test('items default to fixed price; the switch can be set on create and update (JSON or form)', async () => {
  assert.equal(fixed.allow_price_change, 0);
  assert.equal(openPrice.allow_price_change, 1);

  let r = await t.call('PUT', `/api/items/${fixed.id}`, { token: owner, body: { allow_price_change: 'maybe' } });
  assert.equal(r.status, 400);

  const fd = new FormData();
  fd.append('allow_price_change', 'true');
  r = await t.call('PUT', `/api/items/${fixed.id}`, { token: owner, body: fd });
  assert.equal(r.status, 200);
  assert.equal(r.body.allow_price_change, 1);

  r = await t.call('PUT', `/api/items/${fixed.id}`, { token: owner, body: { name: 'Masala Tea' } });
  assert.equal(r.body.allow_price_change, 1, 'unchanged when not sent');
  r = await t.call('PUT', `/api/items/${fixed.id}`, { token: owner, body: { allow_price_change: false, name: 'Tea' } });
  assert.equal(r.body.allow_price_change, 0);

  const list = (await t.call('GET', '/api/items', { token: cashier })).body.items;
  assert.equal(list.find((i) => i.id === openPrice.id).allow_price_change, 1, 'billing screen can see the switch');
});

test('a manager can change the price of an open-price item; both prices are kept', async () => {
  const r = await bill(manager, [
    { item_id: openPrice.id, quantity: 2, unit_price: 750.5, price_change_reason: '  Extra parts  ' },
    { item_id: fixed.id, quantity: 1 }
  ]);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.order.subtotal, 1511);
  const repair = r.body.items.find((i) => i.item_id === openPrice.id);
  assert.equal(repair.unit_price, 750.5);
  assert.equal(repair.catalog_unit_price, 500);
  assert.equal(repair.price_changed, 1);
  assert.equal(repair.price_change_reason, 'Extra parts');
  const tea = r.body.items.find((i) => i.item_id === fixed.id);
  assert.equal(tea.price_changed, 0);
  assert.equal(tea.catalog_unit_price, 10);

  const again = await t.call('GET', `/api/orders/${r.body.order.id}`, { token: owner });
  assert.equal(again.body.items.find((i) => i.item_id === openPrice.id).catalog_unit_price, 500);
});

test('price changes get their own audit entry', async () => {
  const logs = await t.call('GET', '/api/audit-logs', { token: owner });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  const entry = list.find((l) => l.action === 'BILL_PRICE_CHANGE');
  assert.ok(entry);
  const v = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
  assert.deepEqual(v.lines[0], {
    item_id: openPrice.id, item_name: 'Repair Service', quantity: 2, catalog_price: 500, charged_price: 750.5, reason: 'Extra parts'
  });
});

test('fixed-price items cannot be changed, by anyone', async () => {
  const r = await bill(owner, [{ item_id: fixed.id, quantity: 1, unit_price: 5 }]);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /can't be changed/);
});

test('cashiers need the permission; sending the catalog price needs none', async () => {
  const r = await bill(cashier, [{ item_id: openPrice.id, quantity: 1, unit_price: 400 }]);
  assert.equal(r.status, 403);
  assert.deepEqual(r.body.required, ['billing.price_change']);

  const same = await bill(cashier, [{ item_id: openPrice.id, quantity: 1, unit_price: '500.00' }]);
  assert.equal(same.status, 201);
  assert.equal(same.body.items[0].price_changed, 0);

  // Owner grants it to Cashier: works immediately
  const perms = ['billing.create', 'billing.discount', 'orders.view', 'customers.view', 'customers.manage'];
  await t.call('PUT', '/api/roles/CASHIER', { token: owner, body: { permissions: [...perms, 'billing.price_change'] } });
  assert.equal((await bill(cashier, [{ item_id: openPrice.id, quantity: 1, unit_price: 400 }])).status, 201);
  await t.call('PUT', '/api/roles/CASHIER', { token: owner, body: { permissions: perms } });
});

test('changed prices are validated and money stays exact', async () => {
  for (const unit_price of [-1, 'abc', 100000001]) {
    assert.equal((await bill(owner, [{ item_id: openPrice.id, quantity: 1, unit_price }])).status, 400, String(unit_price));
  }
  assert.equal((await bill(owner, [{ item_id: openPrice.id, quantity: 1, unit_price: 1, price_change_reason: 42 }])).status, 400);

  // ₹0.10 x 3 = ₹0.30 exactly; a free item (₹0) is allowed
  const r = await bill(owner, [{ item_id: openPrice.id, quantity: 3, unit_price: 0.1 }]);
  assert.equal(r.body.order.subtotal, 0.3);
  assert.equal((await bill(owner, [{ item_id: openPrice.id, quantity: 1, unit_price: 0 }])).status, 201);
});

test('the discount limit applies to the changed total', async () => {
  // Manager limit 50%: charged subtotal ₹200 -> max ₹100 discount
  const lines = [{ item_id: openPrice.id, quantity: 1, unit_price: 200 }];
  assert.equal((await bill(manager, lines, { discount: 101 })).status, 403);
  assert.equal((await bill(manager, lines, { discount: 100 })).status, 201);
});
