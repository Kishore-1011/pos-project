// Phase 1 step 7: users, roles & permissions.
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');
const { resetLoginLimiter, MAX_FAILURES } = require('../src/middleware/loginLimiter');

let t;
let owner, manager, cashier;
let item, cust, orderId;

const createUser = (body, token = owner) => t.call('POST', '/api/users', { token, body });
const putRole = (code, body, token = owner) => t.call('PUT', `/api/roles/${code}`, { token, body });
const bill = (token, extra = {}) => t.call('POST', '/api/orders', {
  token, body: { items: [{ item_id: item.id, quantity: 10 }], payment_method: 'UPI', ...extra }
});
const DEFAULT_CASHIER = ['billing.create', 'billing.discount', 'customers.manage', 'customers.view', 'orders.view'];

before(async () => {
  t = await startTestServer();
  owner = await t.login('admin', 'admin123');
  await createUser({ username: 'manager1', password: 'manager123', full_name: 'Mani Manager', role: 'MANAGER' });
  await createUser({ username: 'cashier1', password: 'cashier123', full_name: 'Cathy Cashier', role: 'CASHIER' });
  manager = await t.login('manager1', 'manager123');
  cashier = await t.login('cashier1', 'cashier123');
  item = (await t.call('POST', '/api/items', { token: owner, body: { name: 'Tea', price: 10 } })).body;
  cust = (await t.call('POST', '/api/customers', { token: owner, body: { name: 'Ravi', phone: '9876543210' } })).body.customer;
  orderId = (await bill(owner)).body.order.id;
});
after(() => t.close());
beforeEach(() => resetLoginLimiter());

test('existing admin became Owner with every permission; login returns role and permissions', async () => {
  const r = await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'OWNER');
  assert.equal(r.body.user.role_name, 'Owner');
  assert.equal(r.body.user.max_discount_pct, null);
  assert.equal(r.body.user.permissions.length, 14);
  assert.ok(!('password_hash' in r.body.user) && !('pin_hash' in r.body.user));
  assert.match(r.body.user.last_login_at, /^\d{4}-\d{2}-\d{2}T/);
});

test('default roles: what Manager and Cashier can and cannot do', async () => {
  const roles = (await t.call('GET', '/api/roles', { token: owner })).body;
  assert.deepEqual(roles.roles.map((r) => r.code), ['OWNER', 'MANAGER', 'CASHIER']);
  assert.equal(roles.permissions.length, 14);
  assert.deepEqual(roles.roles.find((r) => r.code === 'CASHIER').permissions, DEFAULT_CASHIER);
  assert.equal(roles.roles.find((r) => r.code === 'OWNER').editable, false);

  // Manager: voids, reports, catalog, audit — but not users or settings
  assert.equal((await t.call('GET', '/api/reports/eod', { token: manager })).status, 200);
  assert.equal((await t.call('GET', '/api/audit-logs', { token: manager })).status, 200);
  assert.equal((await t.call('POST', '/api/items', { token: manager, body: { name: 'Coffee', price: 20 } })).status, 201);
  assert.equal((await t.call('GET', '/api/roles', { token: manager })).status, 403);
  assert.equal((await t.call('PUT', '/api/settings', { token: manager, body: { business_day_cutoff: '01:00' } })).status, 403);

  // Cashier: bills and customers only
  assert.equal((await bill(cashier)).status, 201);
  assert.equal((await t.call('GET', '/api/reports/eod', { token: cashier })).status, 403);
  assert.equal((await t.call('PATCH', `/api/orders/${orderId}/status`, { token: cashier, body: { status: 'VOID', reason: 'x test' } })).status, 403);
  assert.equal((await t.call('DELETE', `/api/customers/${cust.id}`, { token: cashier })).status, 403);
});

test('every protected endpoint refuses a role with no permissions; open ones stay open', async () => {
  assert.equal((await putRole('CASHIER', { permissions: [] })).status, 200);
  const protectedEndpoints = [
    ['POST', '/api/orders'], ['GET', '/api/orders'], ['GET', `/api/orders/${orderId}`], ['PATCH', `/api/orders/${orderId}/status`],
    ['GET', '/api/customers'], ['GET', `/api/customers/${cust.id}`], ['POST', '/api/customers'], ['PUT', `/api/customers/${cust.id}`],
    ['PATCH', `/api/customers/${cust.id}/status`], ['DELETE', `/api/customers/${cust.id}`],
    ['POST', '/api/items'], ['PUT', `/api/items/${item.id}`], ['PATCH', `/api/items/${item.id}/status`], ['PATCH', '/api/items/bulk'],
    ['POST', '/api/categories'], ['PUT', '/api/categories/1'], ['PATCH', '/api/categories/1/status'], ['DELETE', '/api/categories/1'],
    ['GET', '/api/reports/eod'], ['GET', '/api/audit-logs'],
    ['POST', '/api/users'], ['PUT', '/api/users/1'], ['PATCH', '/api/users/1/status'], ['PATCH', '/api/users/1/password'], ['PUT', '/api/users/1/pin'],
    ['GET', '/api/roles'], ['PUT', '/api/roles/MANAGER'],
    ['PUT', '/api/settings'], ['PUT', '/api/organization'], ['PUT', '/api/organization/licences'],
    ['POST', '/api/organization/logo'], ['DELETE', '/api/organization/logo'],
    ['GET', '/api/number-series'], ['PUT', '/api/number-series/INVOICE'], ['POST', '/api/number-series/INVOICE/preview']
  ];
  const leaks = [];
  for (const [method, path] of protectedEndpoints) {
    const r = await t.call(method, path, { token: cashier, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    if (r.status !== 403) leaks.push(`${method} ${path} -> ${r.status}`);
  }
  assert.deepEqual(leaks, [], 'all protected endpoints must answer 403');
  assert.equal(protectedEndpoints.length, 35);

  // Needed by every screen regardless of role
  for (const path of ['/api/items', '/api/categories', '/api/users', '/api/settings', '/api/organization', '/api/auth/me', '/api/auth/pin-users']) {
    assert.equal((await t.call('GET', path, { token: cashier })).status, 200, path);
  }
  const usersList = (await t.call('GET', '/api/users', { token: cashier })).body;
  assert.ok(usersList.every((u) => !('phone' in u) && !('email' in u)), 'non-managers see names only');

  assert.equal((await putRole('CASHIER', { permissions: DEFAULT_CASHIER })).status, 200);
});

test('permission changes apply immediately, without logging in again', async () => {
  assert.equal((await t.call('GET', '/api/reports/eod', { token: cashier })).status, 403);
  await putRole('CASHIER', { permissions: [...DEFAULT_CASHIER, 'reports.view'] });
  assert.equal((await t.call('GET', '/api/reports/eod', { token: cashier })).status, 200);
  await putRole('CASHIER', { permissions: DEFAULT_CASHIER });
  assert.equal((await t.call('GET', '/api/reports/eod', { token: cashier })).status, 403);
});

test('discount limits follow the role; no discount permission means no discount at all', async () => {
  // ₹100 bill. Cashier 20%, Manager 50%, Owner unlimited
  assert.equal((await bill(cashier, { discount: 21 })).status, 403);
  assert.equal((await bill(cashier, { discount: 20 })).status, 201);
  assert.equal((await bill(manager, { discount: 50 })).status, 201);
  assert.equal((await bill(manager, { discount: 51 })).status, 403);
  assert.equal((await bill(owner, { discount: 100 })).status, 201);

  await putRole('CASHIER', { permissions: DEFAULT_CASHIER.filter((p) => p !== 'billing.discount') });
  const r = await bill(cashier, { discount: 1 });
  assert.equal(r.status, 403);
  assert.match(r.body.error, /permission to give discounts/);
  assert.equal((await bill(cashier)).status, 201, 'bills without discount still work');
  await putRole('CASHIER', { permissions: DEFAULT_CASHIER });

  assert.equal((await putRole('MANAGER', { max_discount_pct: null })).status, 200, 'empty = no limit');
  assert.equal((await bill(manager, { discount: 90 })).status, 201);
  await putRole('MANAGER', { max_discount_pct: 50 });
});

test('voiding and restoring are separate permissions', async () => {
  const id = (await bill(owner)).body.order.id;
  await putRole('MANAGER', {
    permissions: ['billing.create', 'billing.discount', 'orders.view', 'orders.void', 'reports.view', 'customers.view']
  });
  const status = (body) => t.call('PATCH', `/api/orders/${id}/status`, { token: manager, body });
  assert.equal((await status({ status: 'VOID', reason: 'Wrong item' })).status, 200);
  const restore = await status({ status: 'PAID', reason: 'Mistake' });
  assert.equal(restore.status, 403);
  assert.deepEqual(restore.body.required, ['orders.unvoid']);
  await putRole('MANAGER', {
    permissions: ['billing.create', 'billing.discount', 'billing.price_change', 'orders.view', 'orders.void', 'orders.unvoid',
      'customers.view', 'customers.manage', 'customers.delete', 'items.manage', 'reports.view', 'audit.view']
  });
  assert.equal((await status({ status: 'PAID', reason: 'Mistake' })).status, 200);
});

test('role editing rules: Owner fixed, not your own role, cannot grant what you lack', async () => {
  assert.equal((await putRole('OWNER', { permissions: [] })).status, 400);
  assert.equal((await putRole('NOPE', { permissions: [] })).status, 404);
  assert.equal((await putRole('CASHIER', { permissions: ['billing.create', 'make.coffee'] })).status, 400);

  // Give Manager user management (but not settings)
  const mgrPerms = (await t.call('GET', '/api/roles', { token: owner })).body.roles.find((r) => r.code === 'MANAGER').permissions;
  await putRole('MANAGER', { permissions: [...mgrPerms, 'users.manage'] });

  assert.equal((await putRole('MANAGER', { max_discount_pct: 100 }, manager)).status, 403, 'own role');
  const escalate = await putRole('CASHIER', { permissions: [...DEFAULT_CASHIER, 'settings.manage'] }, manager);
  assert.equal(escalate.status, 400);
  assert.match(escalate.body.fields.permissions, /settings\.manage/);
  assert.equal((await putRole('CASHIER', { permissions: [...DEFAULT_CASHIER, 'reports.view'] }, manager)).status, 200);
  await putRole('CASHIER', { permissions: DEFAULT_CASHIER });
});

test('Owner accounts are protected from non-owners and from lock-out', async () => {
  // manager has users.manage from the previous test
  const ownerUser = (await t.call('GET', '/api/users', { token: owner })).body.find((u) => u.username === 'admin');
  assert.equal((await createUser({ username: 'boss2', password: 'secret12', full_name: 'B', role: 'OWNER' }, manager)).status, 403);
  assert.equal((await t.call('PATCH', `/api/users/${ownerUser.id}/status`, { token: manager, body: { is_active: 0 } })).status, 403);
  assert.equal((await t.call('PATCH', `/api/users/${ownerUser.id}/password`, { token: manager, body: { new_password: 'hacked123' } })).status, 403);
  assert.equal((await t.call('PUT', `/api/users/${ownerUser.id}`, { token: manager, body: { role: 'CASHIER' } })).status, 403);

  // owner can't demote or deactivate themselves
  assert.equal((await t.call('PUT', `/api/users/${ownerUser.id}`, { token: owner, body: { role: 'MANAGER' } })).status, 400);
  assert.equal((await t.call('PATCH', `/api/users/${ownerUser.id}/status`, { token: owner, body: { is_active: 0 } })).status, 400);

  // an Owner can create another Owner (ADMIN accepted as an alias from older screens)
  const r = await createUser({ username: 'boss2', password: 'secret12', full_name: 'Second Owner', role: 'ADMIN' });
  assert.equal(r.status, 201);
  assert.equal(r.body.role, 'OWNER');
});

test('user profile validation', async () => {
  const bad = await createUser({ username: 'a b', password: '123', full_name: '', role: 'CHEF', phone: '123', email: 'x@' });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.body.fields).sort(), ['email', 'full_name', 'password', 'phone', 'role', 'username']);
  assert.equal((await createUser({ username: 'CASHIER1', password: 'secret12', full_name: 'Dup', role: 'CASHIER' })).status, 400,
    'usernames are unique ignoring case');

  const ok = await createUser({
    username: 'priya', password: 'secret12', full_name: 'Priya S', role: 'CASHIER', phone: '+91 98765 11111', email: 'Priya@Shop.in', pin: '4321'
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.email, 'priya@shop.in');
  assert.equal(ok.body.has_pin, true);

  const upd = await t.call('PUT', `/api/users/${ok.body.id}`, { token: owner, body: { full_name: 'Priya Sharma', phone: '' } });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.full_name, 'Priya Sharma');
  assert.equal(upd.body.phone, '');
});

test('PIN login for quick switching, with lock-out on wrong PINs', async () => {
  const list = (await t.call('GET', '/api/auth/pin-users', { token: cashier })).body;
  assert.ok(list.some((u) => u.username === 'priya'));
  assert.ok(list.every((u) => !('pin_hash' in u)));

  const ok = await t.call('POST', '/api/auth/pin-login', { body: { username: 'priya', pin: '4321' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.username, 'priya');
  assert.ok(ok.body.user.permissions.includes('billing.create'));

  assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'manager1', pin: '1234' } })).status, 401, 'no PIN set');
  for (let i = 0; i < MAX_FAILURES; i++) {
    assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'priya', pin: '0000' } })).status, 401);
  }
  assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'priya', pin: '4321' } })).status, 429);
  resetLoginLimiter();

  const priya = (await t.call('GET', '/api/users', { token: owner })).body.find((u) => u.username === 'priya');
  assert.equal((await t.call('PUT', `/api/users/${priya.id}/pin`, { token: owner, body: { pin: '12' } })).status, 400);
  assert.equal((await t.call('PUT', `/api/users/${priya.id}/pin`, { token: owner, body: { pin: null } })).status, 200);
  assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'priya', pin: '4321' } })).status, 401, 'PIN cleared');
});

test('users can change their own password and PIN (current password required)', async () => {
  const me = (body) => t.call('PUT', '/api/auth/me/password', { token: cashier, body });
  assert.equal((await me({ current_password: 'wrong', new_password: 'newpass123' })).status, 401);
  assert.equal((await me({ current_password: 'cashier123', new_password: '123' })).status, 400);
  assert.equal((await me({ current_password: 'cashier123', new_password: 'newpass123' })).status, 200);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'cashier1', password: 'cashier123' } })).status, 401);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'cashier1', password: 'newpass123' } })).status, 200);

  const pin = await t.call('PUT', '/api/auth/me/pin', { token: cashier, body: { current_password: 'newpass123', pin: '2468' } });
  assert.equal(pin.status, 200);
  assert.equal(pin.body.user.has_pin, true);
  assert.equal((await t.call('POST', '/api/auth/pin-login', { body: { username: 'cashier1', pin: '2468' } })).status, 200);
});

test('deactivating a user cuts off their open session at once', async () => {
  const u = (await createUser({ username: 'temp1', password: 'secret12', full_name: 'Temp', role: 'CASHIER' })).body;
  const token = await t.login('temp1', 'secret12');
  assert.equal((await t.call('GET', '/api/auth/me', { token })).status, 200);
  assert.equal((await t.call('PATCH', `/api/users/${u.id}/status`, { token: owner, body: { is_active: 0 } })).status, 200);
  assert.equal((await t.call('GET', '/api/auth/me', { token })).status, 403);
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'temp1', password: 'secret12' } })).status, 403);
});

test('user and role changes are audited', async () => {
  const logs = await t.call('GET', '/api/audit-logs', { token: owner });
  const list = Array.isArray(logs.body) ? logs.body : logs.body.logs || logs.body.audit_logs || [];
  const actions = new Set(list.map((l) => l.action));
  for (const a of ['USER_CREATE', 'USER_UPDATE', 'USER_TOGGLE', 'ROLE_UPDATE', 'USER_PIN_CLEAR', 'PASSWORD_CHANGE', 'PIN_SET']) {
    assert.ok(actions.has(a), a);
  }
});
