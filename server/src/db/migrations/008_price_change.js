// Price change at billing (data side): per-item switch, and each bill line keeps the catalog price
// next to the price actually charged, with an optional reason.
module.exports = {
  name: 'price_change',
  up(db) {
    db.exec(`
      ALTER TABLE items ADD COLUMN allow_price_change INTEGER NOT NULL DEFAULT 0;

      ALTER TABLE order_items ADD COLUMN catalog_unit_price_paise INTEGER;
      ALTER TABLE order_items ADD COLUMN price_change_reason TEXT;
      -- Existing lines were always billed at the catalog price
      UPDATE order_items SET catalog_unit_price_paise = unit_price_paise WHERE catalog_unit_price_paise IS NULL;
    `);
  }
};
