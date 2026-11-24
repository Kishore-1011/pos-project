// Migration 009: a database that already has bills is treated as set up (no wizard for existing shops).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer } = require('./helpers');

let t;
before(async () => { t = await startTestServer(); });
after(() => t.close());

test('fresh database without bills still requires setup after migration 009', async () => {
  const r = await t.call('GET', '/api/setup/status');
  assert.equal(r.body.setup_required, true);
});

test('existing database with bills is marked as set up when migration 009 runs', async () => {
  const db = require('../src/db/database');
  const { migrate } = require('../src/db/migrate');
  // An existing shop: has bills, upgraded from before migration 009
  db.runSync(
    `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
       payment_method, payment_status) VALUES ('OLD-1', 'OLD-1', 1, 1000, 0, 1000, 'CASH', 'PAID')`
  );
  db.runSync('DELETE FROM schema_migrations WHERE version = 9');
  db.runSync('UPDATE organization SET setup_completed_at = NULL WHERE id = 1');

  assert.deepEqual(migrate({ log: () => {} }), [9]);
  assert.ok(db.getSync('SELECT setup_completed_at FROM organization WHERE id = 1').setup_completed_at);
  assert.equal((await t.call('GET', '/api/setup/status')).body.setup_required, false);
  assert.equal((await t.call('POST', '/api/setup/complete', { body: {} })).status, 409);

  // Other routes were never gated on setup: the seeded admin still works for existing shops
  assert.equal((await t.call('POST', '/api/auth/login', { body: { username: 'admin', password: 'admin123' } })).status, 200);
});
