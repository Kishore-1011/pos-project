// Store all money as whole paise (INTEGER) in *_paise columns.
// SQLite can't drop a column used in a CHECK constraint, so the three money tables are rebuilt
// (the documented SQLite pattern: create new table, copy, drop old, rename).

const toPaise = (col) => `CAST(ROUND(COALESCE(${col}, 0) * 100) AS INTEGER)`;

module.exports = {
  name: 'money_paise',
  up(db) {
    db.exec(`
      CREATE TABLE items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_id INTEGER,
        name TEXT NOT NULL,
        price_paise INTEGER NOT NULL CHECK(price_paise >= 0),
        image_url TEXT,
        is_active INTEGER DEFAULT 1 NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id)
      );
      INSERT INTO items_new (id, category_id, name, price_paise, image_url, is_active, created_at, updated_at)
        SELECT id, category_id, name, ${toPaise('price')}, image_url, COALESCE(is_active, 1), created_at, updated_at FROM items;
      DROP TABLE items;
      ALTER TABLE items_new RENAME TO items;

      CREATE TABLE orders_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        invoice_no TEXT,
        user_id INTEGER NOT NULL,
        customer_id INTEGER,
        subtotal_paise INTEGER NOT NULL CHECK(subtotal_paise >= 0),
        discount_paise INTEGER DEFAULT 0 NOT NULL CHECK(discount_paise >= 0),
        final_amount_paise INTEGER NOT NULL CHECK(final_amount_paise >= 0),
        payment_method TEXT CHECK(payment_method IN ('CASH', 'UPI', 'CARD')) NOT NULL,
        payment_status TEXT CHECK(payment_status IN ('PAID', 'PENDING', 'VOID')) NOT NULL,
        cash_received_paise INTEGER DEFAULT 0 NOT NULL,
        change_given_paise INTEGER DEFAULT 0 NOT NULL,
        notes TEXT,
        metadata TEXT,
        void_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      );
      INSERT INTO orders_new (id, order_number, invoice_no, user_id, customer_id, subtotal_paise, discount_paise,
          final_amount_paise, payment_method, payment_status, cash_received_paise, change_given_paise,
          notes, metadata, void_reason, created_at, updated_at)
        SELECT id, order_number, COALESCE(invoice_no, order_number), user_id, customer_id, ${toPaise('subtotal')},
          ${toPaise('discount')}, ${toPaise('final_amount')}, payment_method, payment_status,
          ${toPaise('cash_received')}, ${toPaise('change_given')}, notes, metadata, void_reason, created_at, updated_at
        FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_new RENAME TO orders;

      CREATE TABLE order_items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        unit_price_paise INTEGER NOT NULL CHECK(unit_price_paise >= 0),
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        subtotal_paise INTEGER NOT NULL CHECK(subtotal_paise >= 0),
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES items(id)
      );
      INSERT INTO order_items_new (id, order_id, item_id, item_name, unit_price_paise, quantity, subtotal_paise)
        SELECT id, order_id, item_id, item_name, ${toPaise('unit_price')}, quantity, ${toPaise('subtotal')} FROM order_items;
      DROP TABLE order_items;
      ALTER TABLE order_items_new RENAME TO order_items;
    `);
  }
};
