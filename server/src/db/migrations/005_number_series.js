// Configurable number series (v1: INVOICE and CUSTOMER) with per-period counters.
module.exports = {
  name: 'number_series',
  up(db) {
    db.exec(`
      CREATE TABLE number_series (
        code TEXT PRIMARY KEY,                       -- INVOICE | CUSTOMER
        name TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT '',
        separator TEXT NOT NULL DEFAULT '/' CHECK (separator IN ('/', '-', '')),
        include_period INTEGER NOT NULL DEFAULT 0,   -- put the FY / year / month / day in the number
        padding INTEGER NOT NULL DEFAULT 4 CHECK (padding BETWEEN 1 AND 8),
        suffix TEXT NOT NULL DEFAULT '',
        reset_policy TEXT NOT NULL DEFAULT 'NEVER'
          CHECK (reset_policy IN ('NEVER', 'FINANCIAL_YEAR', 'YEARLY', 'MONTHLY', 'DAILY')),
        start_number INTEGER NOT NULL DEFAULT 1 CHECK (start_number >= 1),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Last number handed out per series and period (period_key 'ALL' when the series never resets)
      CREATE TABLE number_series_counters (
        series_code TEXT NOT NULL REFERENCES number_series(code),
        period_key TEXT NOT NULL,
        last_number INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (series_code, period_key)
      );

      INSERT INTO number_series (code, name, prefix, separator, include_period, padding, reset_policy)
      VALUES
        ('INVOICE', 'Invoice', 'INV', '/', 1, 4, 'FINANCIAL_YEAR'),   -- INV/25-26/0001
        ('CUSTOMER', 'Customer', 'CUST', '-', 0, 4, 'NEVER');         -- CUST-0001

      CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
    `);

    // Existing customers keep their codes; new ones continue after the highest CUST-n in use.
    const row = db.prepare(
      `SELECT MAX(CAST(SUBSTR(customer_code, 6) AS INTEGER)) AS n FROM customers
       WHERE customer_code LIKE 'CUST-%' AND SUBSTR(customer_code, 6) GLOB '[0-9]*'`
    ).get();
    if (row && row.n) {
      db.prepare(`INSERT INTO number_series_counters (series_code, period_key, last_number) VALUES ('CUSTOMER', 'ALL', ?)`)
        .run(row.n);
    }
  }
};
