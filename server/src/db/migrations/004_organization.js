// Organization profile (single row), tax registration, and the list of licences printed on bills.
module.exports = {
  name: 'organization',
  up(db) {
    db.exec(`
      CREATE TABLE organization (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        legal_name TEXT NOT NULL DEFAULT '',
        trade_name TEXT NOT NULL DEFAULT '',
        address_line1 TEXT NOT NULL DEFAULT '',
        address_line2 TEXT NOT NULL DEFAULT '',
        city TEXT NOT NULL DEFAULT '',
        state_code TEXT,
        pincode TEXT NOT NULL DEFAULT '',
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        website TEXT NOT NULL DEFAULT '',
        logo_url TEXT,
        business_types TEXT NOT NULL DEFAULT '[]',          -- JSON array of FOOD | RETAIL | SERVICES
        gst_registration_type TEXT NOT NULL DEFAULT 'UNREGISTERED'
          CHECK (gst_registration_type IN ('REGULAR', 'COMPOSITION', 'UNREGISTERED')),
        gstin TEXT,
        pan TEXT,
        setup_completed_at DATETIME,                        -- set by the Phase 2 setup wizard
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO organization (id) VALUES (1);

      CREATE TABLE licences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK (type IN ('FSSAI', 'DRUG', 'SHOP_ESTABLISHMENT', 'TRADE', 'OTHER')),
        label TEXT NOT NULL DEFAULT '',                     -- shown on the bill, e.g. "FSSAI Lic. No."
        number TEXT NOT NULL,
        valid_until DATE,
        print_on_bill INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }
};
