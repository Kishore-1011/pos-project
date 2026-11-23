// Store every order time in one sortable UTC format: 2026-11-23T10:15:00.000Z (what JavaScript's
// toISOString() produces). Older rows created via SQL defaults look like '2026-11-23 10:15:00', and
// the two formats don't compare correctly as text (' ' sorts before 'T'), which breaks date-range
// filters. A trigger keeps any future insert or update in the same format.
const ISO = `strftime('%Y-%m-%dT%H:%M:%fZ', created_at)`;
const ISO_PATTERN = `'____-__-__T__:__:__.___Z'`;

module.exports = {
  name: 'order_time_format',
  up(db) {
    db.exec(`
      UPDATE orders SET created_at = ${ISO}
      WHERE created_at IS NOT NULL AND created_at NOT LIKE ${ISO_PATTERN} AND ${ISO} IS NOT NULL;

      UPDATE orders SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE created_at IS NULL;

      CREATE TRIGGER orders_created_at_iso_insert AFTER INSERT ON orders
      WHEN NEW.created_at IS NULL OR NEW.created_at NOT LIKE ${ISO_PATTERN}
      BEGIN
        UPDATE orders SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at),
                                                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = NEW.id;
      END;

      CREATE TRIGGER orders_created_at_iso_update AFTER UPDATE OF created_at ON orders
      WHEN NEW.created_at IS NULL OR NEW.created_at NOT LIKE ${ISO_PATTERN}
      BEGIN
        UPDATE orders SET created_at = COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', NEW.created_at),
                                                strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        WHERE id = NEW.id;
      END;
    `);
  }
};
