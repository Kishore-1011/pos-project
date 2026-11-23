// Baseline: the schema as it was at the end of Phase 0 (money as REAL rupees).
// Idempotent, so it also brings older AIRAS-era / pre-migration databases up to the same shape.

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = {
  name: 'baseline',
  up(db) {
    db.exec(`
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

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        phone TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

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

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Columns that older databases gained over time via ALTER TABLE
    addColumnIfMissing(db, 'items', 'image_url', 'TEXT');
    addColumnIfMissing(db, 'orders', 'invoice_no', 'TEXT');
    addColumnIfMissing(db, 'orders', 'customer_id', 'INTEGER');
    addColumnIfMissing(db, 'orders', 'void_reason', 'TEXT');
    addColumnIfMissing(db, 'categories', 'is_active', 'INTEGER DEFAULT 1');
    addColumnIfMissing(db, 'customers', 'is_active', 'INTEGER DEFAULT 1');
  }
};
