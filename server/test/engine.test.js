// Phase 1 engine switch: migrations, legacy upgrade, all-or-nothing order saves.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { startTestServer } = require('./helpers');

let t;
let admin;

// Build a database exactly as the old engine (sql.js, Phase 0 schema) left it: REAL rupee columns,
// columns added later via ALTER TABLE, no schema_migrations table.
function writeLegacyDatabase(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL, role TEXT CHECK(role IN ('ADMIN','CASHIER')) NOT NULL, is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE customers (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0), is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id));
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL,
      subtotal REAL NOT NULL, discount REAL DEFAULT 0.0 NOT NULL, final_amount REAL NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('CASH','UPI','CARD')) NOT NULL,
      payment_status TEXT CHECK(payment_status IN ('PAID','PENDING','VOID')) NOT NULL,
      cash_received REAL DEFAULT 0.0, change_given REAL DEFAULT 0.0, notes TEXT, metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id));
    CREATE TABLE order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL, unit_price REAL NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0), subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id));
    CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, user_name TEXT NOT NULL, action TEXT NOT NULL,
      entity_type TEXT NOT NULL, entity_id INTEGER NOT NULL, old_value TEXT, new_value TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id));
    ALTER TABLE items ADD COLUMN image_url TEXT;
    ALTER TABLE orders ADD COLUMN invoice_no TEXT;
    ALTER TABLE orders ADD COLUMN customer_id INTEGER;
  `);
  db.prepare(`INSERT INTO users (username, password_hash, full_name, role) VALUES ('admin', ?, 'Owner', 'ADMIN')`)
    .run(bcrypt.hashSync('admin123', 4));
  db.prepare(`INSERT INTO customers (customer_code, name, phone) VALUES ('CUST-0001', 'Ravi', '9876543210')`).run();
  db.prepare(`INSERT INTO categories (name) VALUES ('Snacks')`).run();
  db.prepare(`INSERT INTO items (category_id, name, price) VALUES (1, 'Tea', 10.1), (1, 'Samosa', 15)`).run();
  // Float-drift values as the old engine stored them
  db.prepare(`INSERT INTO orders (order_number, invoice_no, user_id, customer_id, subtotal, discount, final_amount,
      payment_method, payment_status, cash_received, change_given, created_at)
      VALUES ('AIRAS-0001', 'AIRAS-0001', 1, 1, 75.3, 5, 70.3, 'CASH', 'PAID', 100, 29.700000000000003, '2026-11-20T06:00:00.000Z')`).run();
  db.prepare(`INSERT INTO orders (order_number, user_id, subtotal, discount, final_amount, payment_method, payment_status,
      cash_received, change_given, created_at)
      VALUES ('AIRAS-0002', 1, 30.299999999999997, 0, 30.299999999999997, 'UPI', 'PAID', 30.3, 0, '2026-11-20 07:00:00')`).run();
  db.prepare(`INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, subtotal)
      VALUES (1, 1, 'Tea', 10.1, 3, 30.299999999999997), (1, 2, 'Samosa', 15, 3, 45), (2, 1, 'Tea', 10.1, 3, 30.299999999999997)`).run();
  // The old engine never enforced links, so real shops can hold orphans: a bill line whose item was deleted.
  db.pragma('foreign_keys = OFF');
  db.prepare(`INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, subtotal)
      VALUES (2, 99, 'Discontinued Item', 0, 1, 0)`).run();
  db.close();
}

before(async () => {
  writeLegacyDatabase(process.env.POS_DB_PATH);
  t = await startTestServer();
  admin = await t.login('admin', 'admin123');
});

after(() => t.close());

test('legacy database is upgraded: all migrations recorded, integrity ok', () => {
  const { getDb } = require('../src/db/database');
  const db = getDb();
  const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map((r) => r.version);
  const { loadMigrations } = require('../src/db/migrate');
  assert.deepEqual(versions, loadMigrations().map((m) => m.version));
  assert.ok(versions.length >= 3);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  assert.equal(db.pragma('journal_mode', { simple: true }), 'wal');
  const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  assert.ok(cols.includes('final_amount_paise') && !cols.includes('final_amount'));
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1, 'links are enforced again after upgrading');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM order_items WHERE item_id = 99').get().n, 1, 'orphan line kept, not lost');
  assert.equal(db.prepare('SELECT created_at FROM orders WHERE id = 2').get().created_at, '2026-11-20T07:00:00.000Z',
    'old space-separated time converted to ISO UTC');
});

test('a backup copy is written before upgrading a database that has data', () => {
  const backupDir = path.join(path.dirname(process.env.POS_DB_PATH), 'backups');
  const files = fs.readdirSync(backupDir);
  assert.equal(files.length, 1);
  const backup = new Database(path.join(backupDir, files[0]), { readonly: true });
  assert.equal(backup.prepare('SELECT final_amount FROM orders WHERE id = 1').get().final_amount, 70.3);
  backup.close();
});

test('legacy money is converted to exact paise and served as the same rupee values', async () => {
  const { getDb } = require('../src/db/database');
  const raw = getDb().prepare('SELECT change_given_paise, final_amount_paise FROM orders WHERE id = 1').get();
  assert.deepEqual(raw, { change_given_paise: 2970, final_amount_paise: 7030 });

  const o1 = await t.call('GET', '/api/orders/1', { token: admin });
  assert.equal(o1.status, 200);
  assert.equal(o1.body.order.final_amount, 70.3);
  assert.equal(o1.body.order.change_given, 29.7);
  assert.equal(o1.body.order.customer_name, 'Ravi');
  assert.deepEqual(o1.body.items.map((i) => [i.item_name, i.unit_price, i.subtotal]), [['Tea', 10.1, 30.3], ['Samosa', 15, 45]]);

  const o2 = await t.call('GET', '/api/orders/2', { token: admin });
  assert.equal(o2.body.order.invoice_no, 'AIRAS-0002', 'missing invoice_no is backfilled from order_number');
  assert.equal(o2.body.order.final_amount, 30.3);

  const items = await t.call('GET', '/api/items', { token: admin });
  assert.deepEqual(items.body.items.map((i) => [i.name, i.price]).sort(), [['Samosa', 15], ['Tea', 10.1]]);
});

test('reports and customer totals read paise correctly', async () => {
  const eod = await t.call('GET', '/api/reports/eod?startDate=2026-11-20&endDate=2026-11-20', { token: admin });
  assert.equal(eod.status, 200);
  assert.equal(eod.body.summary.total_revenue, 100.6);
  assert.equal(eod.body.summary.total_discounts, 5);
  assert.equal(eod.body.topItems.find((i) => i.item_name === 'Tea').total_sales, 60.6);

  const cust = await t.call('GET', '/api/customers/1', { token: admin });
  assert.equal(cust.body.customer.total_spend, 70.3);
  assert.equal(cust.body.orders[0].final_amount, 70.3);
});

test('new customers continue after the highest existing CUST- code', async () => {
  const r = await t.call('POST', '/api/customers', { token: admin, body: { name: 'Meena', phone: '9000000001' } });
  assert.equal(r.status, 201);
  assert.equal(r.body.customer.customer_code, 'CUST-0002');
});

test('running migrations again changes nothing', () => {
  const { migrate } = require('../src/db/migrate');
  assert.deepEqual(migrate({ log: () => {} }), []);
});

test('new bills save after the upgrade and continue numbering', async () => {
  const r = await t.call('POST', '/api/orders', {
    token: admin,
    body: { items: [{ item_id: 1, quantity: 3 }], payment_method: 'CASH', cash_received: 50 }
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.order.final_amount, 30.3);
  assert.equal(r.body.order.change_given, 19.7);
  // Old bills keep their numbers; new ones use the invoice series for the current financial year
  const fy = require('../src/services/calendar').financialYear(require('../src/services/calendar').localDateParts()).short;
  assert.equal(r.body.invoice_no, `INV/${fy}/0001`);
});

test('a failure while saving a bill leaves nothing behind (all-or-nothing)', async () => {
  const { getDb } = require('../src/db/database');
  const db = getDb();
  const count = () => ({
    orders: db.prepare('SELECT COUNT(*) n FROM orders').get().n,
    lines: db.prepare('SELECT COUNT(*) n FROM order_items').get().n
  });
  const beforeCounts = count();

  // Simulate a crash at the last step: the audit-log write fails after the order and its lines were inserted
  db.exec(`CREATE TEMP TRIGGER fail_audit BEFORE INSERT ON audit_logs
           WHEN NEW.action = 'ORDER_CREATE' BEGIN SELECT RAISE(ABORT, 'simulated crash'); END`);
  try {
    const r = await t.call('POST', '/api/orders', {
      token: admin,
      body: { items: [{ item_id: 1, quantity: 1 }, { item_id: 2, quantity: 2 }], payment_method: 'UPI' }
    });
    assert.equal(r.status, 500);
  } finally {
    db.exec('DROP TRIGGER fail_audit');
  }
  assert.deepEqual(count(), beforeCounts, 'no half-saved order or lines');

  const next = await t.call('POST', '/api/orders', {
    token: admin, body: { items: [{ item_id: 2, quantity: 1 }], payment_method: 'UPI' }
  });
  assert.match(next.body.invoice_no, /\/0002$/, 'the failed bill did not use up an invoice number');
});

test('2,000 bills save quickly and the list stays fast', async () => {
  const { transaction, runSync } = require('../src/db/database');
  const startedAt = Date.now();
  for (let i = 0; i < 2000; i++) {
    const r = await t.call('POST', '/api/orders', {
      token: admin, body: { items: [{ item_id: 2, quantity: 1 }], payment_method: 'UPI' }
    });
    if (r.status !== 201) assert.fail(`order ${i} failed: ${JSON.stringify(r.body)}`);
  }
  const billMs = (Date.now() - startedAt) / 2000;

  // Pad to ~10,000 orders directly, then time the busiest screens
  transaction(() => {
    for (let i = 0; i < 8000; i++) {
      const { lastInsertRowid } = runSync(
        `INSERT INTO orders (order_number, invoice_no, user_id, subtotal_paise, discount_paise, final_amount_paise,
           payment_method, payment_status, created_at) VALUES (?, ?, 1, 1500, 0, 1500, 'CASH', 'PAID', ?)`,
        [`BULK-${i}`, `BULK-${i}`, new Date(Date.UTC(2026, 10, 1 + (i % 20))).toISOString()]
      );
      runSync(`INSERT INTO order_items (order_id, item_id, item_name, unit_price_paise, quantity, subtotal_paise)
               VALUES (?, 2, 'Samosa', 1500, 1, 1500)`, [lastInsertRowid]);
    }
  });

  let s = Date.now();
  const list = await t.call('GET', '/api/orders?limit=25', { token: admin });
  const listMs = Date.now() - s;
  s = Date.now();
  const eod = await t.call('GET', '/api/reports/eod?startDate=2026-11-01&endDate=2026-11-30', { token: admin });
  const reportMs = Date.now() - s;

  assert.equal(list.status, 200);
  assert.ok(list.body.total >= 10000);
  assert.equal(eod.status, 200);
  console.log(`  avg bill save ${billMs.toFixed(1)} ms | order list ${listMs} ms | month report ${reportMs} ms (10k+ orders)`);
  assert.ok(billMs < 50, `bill save too slow: ${billMs} ms`);
  assert.ok(listMs < 500, `order list too slow: ${listMs} ms`);
  assert.ok(reportMs < 1000, `report too slow: ${reportMs} ms`);
});
