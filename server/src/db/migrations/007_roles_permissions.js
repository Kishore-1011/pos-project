// Roles with editable permissions and discount limits; richer user profile (phone, email, PIN, last login).
// Existing users: ADMIN -> OWNER, CASHIER -> CASHIER. The cashier discount cap setting moves onto the role.
const { PERMISSIONS, DEFAULT_ROLES } = require('../../services/permissions');

module.exports = {
  name: 'roles_permissions',
  up(db) {
    db.exec(`
      CREATE TABLE roles (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        max_discount_pct REAL CHECK (max_discount_pct IS NULL OR (max_discount_pct >= 0 AND max_discount_pct <= 100)),
        is_system INTEGER NOT NULL DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE role_permissions (
        role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
        permission TEXT NOT NULL,
        PRIMARY KEY (role_code, permission)
      );
    `);

    // Carry over the Phase 0 cashier discount cap if the shop had changed it
    const stored = db.prepare("SELECT value FROM settings WHERE key = 'cashier_max_discount_pct'").get();
    let cashierCap = DEFAULT_ROLES.CASHIER.max_discount_pct;
    if (stored) {
      const n = Number(JSON.parse(stored.value));
      if (Number.isFinite(n) && n >= 0 && n <= 100) cashierCap = n;
    }

    const insertRole = db.prepare('INSERT INTO roles (code, name, description, max_discount_pct) VALUES (?, ?, ?, ?)');
    const insertPerm = db.prepare('INSERT INTO role_permissions (role_code, permission) VALUES (?, ?)');
    for (const [code, r] of Object.entries(DEFAULT_ROLES)) {
      insertRole.run(code, r.name, r.description, code === 'CASHIER' ? cashierCap : r.max_discount_pct);
      const perms = r.permissions === 'ALL' ? Object.keys(PERMISSIONS) : r.permissions;
      for (const p of perms) insertPerm.run(code, p);
    }
    db.prepare("DELETE FROM settings WHERE key = 'cashier_max_discount_pct'").run();

    // Rebuild users: role now references roles(code); new profile columns
    db.exec(`
      CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL REFERENCES roles(code),
        phone TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL DEFAULT '',
        pin_hash TEXT,
        is_active INTEGER DEFAULT 1 NOT NULL,
        last_login_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_new (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
        SELECT id, username, password_hash, full_name,
               CASE role WHEN 'ADMIN' THEN 'OWNER' WHEN 'CASHIER' THEN 'CASHIER' ELSE 'CASHIER' END,
               is_active, created_at, updated_at
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_new RENAME TO users;
    `);
  }
};
