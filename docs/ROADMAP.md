# POS Project Roadmap

Scope: Indian food **and** retail shops, Windows desktop first, web/cloud later.
Estimates assume one developer. Phases are in dependency order.
Bug details are in [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md).

| Phase | Theme | Estimate | Status |
|---|---|---|---|
| 0 | Safety & correct billing | ~1 wk | Done (2026-11-23) |
| 1 | Foundation refactor | ~2 wk | |
| 2 | Setup & Shop Settings | ~1 wk | |
| 3 | Catalog for food & retail | ~2 wk | |
| 4 | Billing upgrades | ~2 wk | |
| 5 | Printing & hardware | ~1 wk | |
| 6 | Operations & reports | ~1.5 wk | |
| 7 | Release-ready product | ~1.5 wk | |
| Later | Web / cloud | | |

Phases 0–2 (about 4 weeks) give a safe, rebranded base that can be installed at a pilot shop.

---

## Phase 0: Safety & correct billing
- Random per-install login secret (stored in app data); API listens on `127.0.0.1` only; only the app's own pages may call it; failed-login limit.
- Server enforces billing rules: cash ≥ total; discount ≤ subtotal; admin-set cap on cashier discounts; only active items billable; valid quantities.
- Money computed in whole paise (integers); stored values rounded to exactly 2 decimals. Integer-paise columns follow with migrations in Phase 1.
- UPI and Card as separate payment modes; a reason is required to void or un-void a bill.
- Uploads accept images only (JPEG/PNG/WebP/GIF); multer upgraded to 2.x.

**Done when:** every abuse case in the analysis doc is rejected and covered by an automated test.

**Result (2026-11-23):** 20 tests in `server/test/phase0.test.js`, all passing (`npm --prefix server test`).
- Login: random secret in `<data dir>/.jwt_secret`, HS256 only; 5 failed logins lock that username for 5 minutes (counted per username, because every login on a shop PC comes from the same machine).
- Network: server listens on `127.0.0.1`; requests with a non-loopback Host or Origin are refused (403); `cors` removed.
- Desktop: the embedded server now serves the built UI, so UI and API share one origin. A busy port 5000 falls back to a free port. All `localhost:5000` URLs in the client are gone.
- Billing: prices always come from the DB, money is computed in paise, and these are rejected server-side: underpaid cash, discount above subtotal or negative, cashier discount above `cashier_max_discount_pct` (default 20%, set via `PUT /api/settings`), disabled items or categories, non-integer or out-of-range quantities, unknown customers.
- Payments: CASH / UPI / CARD buttons; digital bills record received = total.
- Voids: reason required to void or un-void, stored in `orders.void_reason` (notes no longer overwritten); `UNVOID_ORDER` audit action.
- Uploads: JPEG/PNG/WebP/GIF only, extension from the real type, served with `nosniff`; multer 2.x.
- Reports: money totals rounded to 2 decimals.

Carried forward: the screen to edit the cashier discount cap, and replacing `admin123` with a setup wizard, both in Phase 2. Integer-paise DB columns are in Phase 1.

## Phase 1: Foundation refactor
- Replace `sql.js` with `better-sqlite3` (real on-disk DB with transactions; native build via electron-builder `install-app-deps`).
- Versioned migrations folder (replaces `ALTER TABLE` in try/catch); money columns as integer paise.
- Atomic invoice numbering with a financial-year series (e.g. `INV/25-26/0001`), as GST requires.
- Shared frontend API client (removes hard-coded `localhost:5000`).
- Split the 800–1,400-line views into components; billing maths in a pure, tested module.
- Linting and GitHub Actions CI.

**Done when:** a 10,000-order DB stays fast, a crash mid-order leaves no partial bill, and CI is green.

## Phase 2: Setup & Shop Settings
- First-run wizard: shop name, address, phone, logo, GSTIN, GST type (regular/composition), business type (Food/Retail/Both), admin password.
- Settings: invoice prefix, receipt footer, receipt width (58/80 mm), feature toggles (stock, tables, modifiers), cashier discount cap.
- 4-digit cashier PIN login for quick switching; no default `admin123`.

**Done when:** a fresh install has no hard-coded shop details and receipts show the shop's own header.

## Phase 3: Catalog for food & retail
- SKU, barcode, unit (pcs/kg/g/L/ml), so weighed and decimal quantities work.
- HSN/SAC and GST rate per item (default from category); tax-inclusive or tax-exclusive pricing.
- Food: variants (Half/Full, S/M/L) and add-ons.
- Retail: stock tracking per item, low-stock alerts, stock adjustments with reason, purchase entry.
- CSV import/export of the catalog.

## Phase 4: Billing upgrades
- GST breakup (CGST/SGST) on the bill, round-off to nearest rupee, Bill of Supply for composition dealers.
- Barcode scanner input; keyboard shortcuts (search, qty, pay, print).
- Hold / park bills.
- Split payment (e.g. ₹200 cash + ₹300 UPI).
- Returns/refunds as credit notes linked to the original bill.
- Dynamic UPI QR (amount pre-filled) on screen and receipt.
- Food: order type (dine-in/takeaway/parcel), optional table number.

## Phase 5: Printing & hardware
- Direct ESC/POS thermal printing over USB/network (no browser print dialog).
- Cash drawer kick on cash sales.
- Kitchen order tickets (KOT) for food shops.
- Needs 1–2 real printer models to test.

## Phase 6: Operations & reports
- Shift open/close with opening cash and drawer count (expected vs. counted).
- Reports: daily, item-wise, category-wise, staff-wise, payment mode, discounts/voids, stock.
- GST summary by rate and HSN for GSTR-1/3B; Excel/CSV export.
- Automatic daily backup, restore from file, optional backup to a Google Drive/OneDrive folder.

## Phase 7: Release-ready product
- Code-signed installer and auto-update via GitHub Releases.
- Crash reporting, About/version screen.
- Licence/activation key (if sold).
- Optional demo data (food menu / retail catalog), user guide, onboarding tips.
- Needs the final product name.

## Later: Web / cloud
Cloud sync, multiple counters on a LAN, online owner dashboard, multi-branch. Phase 1 keeps the API separate so this needs no rewrite.

---

## Open decisions
- GST: support both regular and composition dealers? (Recommended: yes.)
- Pilot shops: one food, one retail.
- Printer models for Phase 5.
- Pricing: one-time licence or subscription (Phase 7).
- Final product name (before Phase 7).
