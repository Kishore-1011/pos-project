const fs = require('fs');
const bcrypt = require('bcryptjs');
const { get, run } = require('./database');
const { migrate } = require('./migrate');
const { getUploadsDirectory } = require('../config/paths');

// Applies database migrations and creates the default admin account if missing. Never deletes data.
async function resetAndSeed() {
  migrate();

  const uploadsDir = getUploadsDirectory();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // TODO(Phase 1): replace with a first-run setup wizard that forces a new admin password.
  const existingAdmin = await get("SELECT id FROM users WHERE username = ?", ['admin']);
  if (!existingAdmin) {
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    await run(
      `INSERT INTO users (username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, ?, 1)`,
      ['admin', adminPasswordHash, 'System Administrator', 'ADMIN']
    );
    console.log('[Seed] Initialized default admin account (admin / admin123).');
  }
}

if (require.main === module) {
  resetAndSeed()
    .then(() => {
      console.log('[Seed] Process finished.');
      process.exit(0);
    })
    .catch(err => {
      console.error('[Seed Error]:', err);
      process.exit(1);
    });
}

module.exports = { resetAndSeed };
