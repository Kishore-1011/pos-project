const { exec } = require('./database');

async function initSchema() {
  const schemaSql = `
    -- Users Table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('ADMIN', 'CASHIER')) NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers Table
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Categories Table
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Items Table (With image_url column)
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER,
      name TEXT NOT NULL,
      price REAL NOT NULL CHECK(price >= 0),
      image_url TEXT,
      is_active INTEGER DEFAULT 1 NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- Orders Table
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      customer_id INTEGER,
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0.0 NOT NULL,
      final_amount REAL NOT NULL,
      payment_method TEXT CHECK(payment_method IN ('CASH', 'UPI', 'CARD')) NOT NULL,
      payment_status TEXT CHECK(payment_status IN ('PAID', 'PENDING', 'VOID')) NOT NULL,
      cash_received REAL DEFAULT 0.0,
      change_given REAL DEFAULT 0.0,
      notes TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );

    -- Order Line Items Table
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      item_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      subtotal REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    -- Audit Logs Table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      old_value TEXT,
      new_value TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Key/value app settings (Phase 2 Shop Settings will build on this)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await exec(schemaSql);

  // Alter table if image_url or invoice_no or customer_id columns don't exist yet on existing database
  try {
    await exec("ALTER TABLE items ADD COLUMN image_url TEXT;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await exec("ALTER TABLE orders ADD COLUMN invoice_no TEXT;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await exec("ALTER TABLE orders ADD COLUMN customer_id INTEGER;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await exec("ALTER TABLE categories ADD COLUMN is_active INTEGER DEFAULT 1;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await exec("ALTER TABLE customers ADD COLUMN is_active INTEGER DEFAULT 1;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  try {
    await exec("ALTER TABLE orders ADD COLUMN void_reason TEXT;");
  } catch (err) {
    // Column already exists, safe to ignore
  }

  console.log('[DB] Database schema initialized with customer, category, image_url & invoice_no support.');
}

module.exports = { initSchema };
