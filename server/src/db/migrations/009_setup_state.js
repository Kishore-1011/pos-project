// First-run setup state. A database that already has bills belongs to a shop that is in use, so it
// is marked as set up and never sent through the setup wizard. Fresh databases stay NULL (wizard runs).
module.exports = {
  name: 'setup_state',
  up(db) {
    const billed = db.prepare('SELECT 1 FROM orders LIMIT 1').get();
    if (billed) {
      db.prepare(
        `UPDATE organization SET setup_completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = 1 AND setup_completed_at IS NULL`
      ).run();
    }
  }
};
