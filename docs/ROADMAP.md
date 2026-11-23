# POS Project Roadmap

Scope (v1): Indian **food, retail and service** businesses, Windows desktop first, web/cloud later.
Estimates assume one developer. Phases are in dependency order.
Bug details are in [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md).

| Phase | Theme | Estimate | Status |
|---|---|---|---|
| 0 | Safety & correct billing | ~1 wk | Done (2026-11-23) |
| 1 | Foundation: DB, series, FY/time zone, roles & permissions | ~3 wk | In progress |
| 2 | Setup wizard & Settings screens | ~1.5 wk | |
| 3 | Catalog for food, retail & services | ~2 wk | |
| 4 | Billing upgrades | ~2 wk | |
| 5 | Printing & hardware | ~1 wk | |
| 6 | Operations & reports | ~1.5 wk | |
| 7 | Release-ready product | ~1.5 wk | |
| Later | v2 features, web / cloud | | |

UI work runs as a parallel track tied to these phases. See [UI enhancement track](#ui-enhancement-track) below.

| UI step | Theme | Estimate | Runs with |
|---|---|---|---|
| UI-1 | Design system & app shell | ~1 wk | Before/with Phase 2 |
| UI-2 | Billing screen redesign | ~1 wk | Phase 4 |
| UI-3 | Lists, reports & dashboard | ~1 wk | Phase 6 |
| UI-4 | Accessibility, languages & polish | ~0.5 wk | Phase 7 |

Phases 0–2 plus UI-1 (about 6.5 weeks) give a safe, configurable base that can be installed at a pilot shop.

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

Carried forward: the screen to edit the cashier discount cap (now a per-role permission limit, Phase 1–2) and replacing `admin123` with a setup wizard (Phase 2).

## Phase 1: Foundation
Data model and server logic only; the screens for these come in Phase 2.

1. **DB engine.** Replace `sql.js` with `better-sqlite3` (on-disk, transactions). Existing DB files open as-is, since both use the SQLite file format. Day-1 trial: confirm prebuilt binaries for the dev Node version and for Electron; upgrade Electron to a current version.
2. **Migrations.** Numbered steps in `server/src/db/migrations/` plus a `schema_migrations` table. `001` = today's schema; later steps convert money columns to integer paise and add the tables below.
3. **Organization.** Legal and trade name, address, city, state (GST state code), PIN, phone, email, logo. Business type: Food / Retail / Services (one or more).
4. **Tax & registrations.** GSTIN and registration type (Regular / Composition / Unregistered → "Bill of Supply"), PAN. A list of licences (FSSAI, Drug licence, Shop & Establishment, Trade, Other), each with a number and a "print on bill" switch. FSSAI is suggested when the business type includes Food.
5. **Number series** (v1: Invoice and Customer). Prefix, suffix, padding, optional FY token, reset rule (never / financial year / yearly / monthly / daily), next number, preview. Allocated inside a transaction, so numbers are never duplicated. GST-registered businesses get GST invoice rules (≤16 characters, letters/digits/`-`/`/` only, unique within the FY); unregistered businesses aren't held to them. Defaults: `INV/{FY}/{0001}` resetting every April; `CUST-{0001}` never resetting.
6. **Time zone, financial year, business day.** Time zone setting (default Asia/Kolkata) replaces the hard-coded `+5:30` in about 15 queries. FY start month (default April). Business-day cutoff (e.g. 02:00 for late-night food shops).
7. **Users, roles & permissions.** User profile: full name, username, phone, email, role, active, 4-digit PIN, last login; self password change and admin reset. Built-in roles with editable permissions: Owner, Manager, Cashier. About 15 permissions:
   - Billing: create bills, give discounts (with a max %), change price at billing, void, restore a void, reprint.
   - Catalog & customers: manage items and categories, manage customers, export customers.
   - Admin: view reports, view audit log, manage users, manage settings.

   The server checks the permission on every request (replaces `requireRole`); the UI hides what a user can't open. Migration maps ADMIN → Owner and CASHIER → Cashier.
8. **Price change at billing (data side).** Per-item flag "allow price change at billing", plus the permission above. Order lines store both catalog price and charged price, and every change is audited. The billing screen part is in Phase 4.
9. **Code health.** Shared client API helper; split the 800–1,400-line views; billing maths in a pure, tested module; linter; GitHub Actions running the tests on every push.

**Done when:** an existing DB upgrades itself on launch; concurrent bills get correct, unique FY-series numbers; daily reports respect the time zone and cutoff; every route is permission-checked; CI is green.

**Progress**
- [x] 1–2 Engine switch, migrations, paise columns (2026-11-23). `better-sqlite3` 13.2 (WAL, `synchronous=FULL`, foreign keys enforced). Migrations `001_baseline`, `002_money_paise`, `003_indexes` run on start, with an automatic backup to `backups/` first; links are checked after upgrading and orphan rows are reported, not dropped. An order, its lines and its audit entry save in one transaction. Money stored as integer paise; API still returns rupees (`server/src/db/columns.js`). Tests: 28 passing, including a legacy-DB upgrade, a simulated crash mid-bill, and 10,000+ orders (bill save ~3.5 ms, order list ~10 ms, month report ~110 ms). A real Phase-0 dev DB upgraded cleanly. Not yet run inside the Electron window (Electron download pending).
- [x] 3–4 Organization, tax & licences (2026-11-23). Migration `004_organization`: single-row `organization` table and a `licences` table. `GET /api/organization` (all staff) returns the profile, licences, compliance warnings and option lists (37 GST state codes, business types, registration types, licence types). Admin-only, audited: `PUT /api/organization` (partial update), `PUT /api/organization/licences` (replace list), `POST|DELETE /api/organization/logo` (images only, 2 MB, old file removed). Validation: GSTIN format, state code and check digit; GSTIN required for Regular/Composition and not allowed when Unregistered; GSTIN must match the selected state and PAN (both filled in from the GSTIN when blank); PIN, phone, email; FSSAI 14 digits. Warnings: name missing, food business without FSSAI, licence expired or expiring within 30 days. Image upload rules moved to a shared `services/imageUpload.js`. Tests: 41 passing (13 new).
- [x] 5 Number series engine (2026-11-23). Migration `005_number_series`: `number_series` (prefix, separator, include period, padding, suffix, reset rule, start number) and per-period `number_series_counters`. Defaults `INV/{FY}/0001` (resets every FY) and `CUST-0001` (never resets; continues after the highest existing CUST- code). Numbers are handed out inside the same transaction as the bill or customer, so a failed save uses no number and simultaneous saves never share one; numbers already in use (e.g. imported) are skipped. FY and periods follow the shop's local date (`services/calendar.js`, fixed to Asia/Kolkata + April until step 6). Rules always applied: a resetting series must show the period, next number can only move forward, max 30 characters, letters/digits and `- / _ . #` (no spaces). GST invoice rules (max 16 characters; letters, digits, `-` and `/` only) apply only when the business is GST-registered (Regular/Composition); registering later with a non-compliant format is allowed but shows an `INVOICE_SERIES_NOT_GST` warning on the organization and series until fixed. Admin API: `GET /api/number-series`, `POST /api/number-series/:code/preview`, `PUT /api/number-series/:code` (audited). Existing bills keep their old numbers. Tests: 54 passing (13 new), including the 31 Mar 23:59 → 1 Apr 00:01 IST rollover and 50 simultaneous bills.
- [x] 6 Time zone, FY, business day (2026-11-23). New settings `time_zone` (any valid IANA zone, default Asia/Kolkata), `fy_start_month` (1–12, default 4; locked with 409 once the first bill exists, since changing it would restart invoice numbering mid-year) and `business_day_cutoff` (00:00–06:00). `GET /api/settings` (all staff) also returns `calendar`: business date, calendar date, current FY with start/end dates. Reports and invoice-list date filters now convert business dates to exact UTC bounds once (`calendar.businessRangeUtc`) instead of `+5:30` maths on every row; the per-day breakdown groups by business date in code (correct across daylight-saving changes). Invoice FY uses the real calendar date, not the business day. Migration `006_order_time_format` converts all order times to one ISO-UTC format, with triggers keeping new rows consistent. Client: `utils/datetime.js` loads the shop's time zone and cutoff at login; all 10 hard-coded `Asia/Kolkata` uses in the screens now follow the setting. Tests: 67 passing (11 new).
- [ ] 7 Users, roles & permissions
- [ ] 8 Price change at billing (data side)
- [ ] 9 Code health & CI

## Phase 2: Setup wizard & Settings screens
- First-run wizard: Business → Address → Tax & licences → Business type → Number series (defaults pre-filled) → Owner account. No default `admin123`.
- Settings screens (admin only, every change audited):
  - Organization: name, address, contacts, logo.
  - Tax & Compliance: GSTIN, registration type, state, PAN, licences.
  - Number Series: invoice and customer series, with live preview.
  - Region & Year: time zone, FY start, business-day cutoff, date format.
  - Receipt: 58/80 mm, header/footer text, what to print (GSTIN, licences, customer).
  - Users: add/edit, reset password or PIN, activate/deactivate.
  - Roles & Permissions: permission grid for the built-in roles, including discount limits.
- 4-digit PIN login for quick user switching.

**Done when:** a fresh install has no hard-coded shop details and receipts show the shop's own header, GSTIN and selected licences.

## Phase 3: Catalog for food, retail & services
- SKU, barcode, unit (pcs/kg/g/L/ml/hr), so weighed and decimal quantities work.
- Item type: goods or service (services have no stock and use SAC instead of HSN).
- HSN/SAC and GST rate per item (default from category); tax-inclusive or tax-exclusive pricing.
- Food: variants (Half/Full, S/M/L) and add-ons.
- Retail: stock tracking per item, low-stock alerts, stock adjustments with reason.
- CSV import/export of the catalog.

## Phase 4: Billing upgrades
- GST breakup (CGST/SGST) on the bill, round-off to nearest rupee, Bill of Supply for composition and unregistered businesses.
- Change a line's price at billing (open-price items), when the item and the user's permission allow it.
- Barcode scanner input; keyboard shortcuts (search, qty, pay, print).
- Hold / park bills.
- Split payment (e.g. ₹200 cash + ₹300 UPI).
- Dynamic UPI QR (amount pre-filled) on screen and receipt.
- Food: order type (dine-in/takeaway/parcel), optional table number.

## Phase 5: Printing & hardware
- Direct ESC/POS thermal printing over USB/network (no browser print dialog).
- Cash drawer kick on cash sales.
- Needs 1–2 real printer models to test.

## Phase 6: Operations & reports
- Shift open/close with opening cash and drawer count (expected vs. counted).
- Reports: daily, item-wise, category-wise, staff-wise, payment mode, discounts/voids, stock.
- GST summary by rate and HSN/SAC for GSTR-1/3B; Excel/CSV export.
- Automatic daily backup, restore from file, optional backup to a Google Drive/OneDrive folder.

## Phase 7: Release-ready product
- Code-signed installer and auto-update via GitHub Releases.
- Crash reporting, About/version screen.
- Licence/activation key (if sold).
- Optional demo data (food menu / retail catalog / services), user guide, onboarding tips.
- Needs the final product name.

## UI enhancement track

**Starting point (from the code, 2026-11-23):** 39 browser `alert()`/`prompt()`/`confirm()` pop-ups; dark-mode styles in 5 of 12 screens but no way to switch it on; almost no keyboard handling or accessibility markup (2 occurrences in the client); every screen hand-styles its own buttons, inputs and tables; the five main views are 470–1,400 lines each. Target screens: 1366×768 laptops and 1024×768 POS terminals, mouse or touch, often operated by keyboard at the counter.

The plan below is drawn from the code. It gets refined after a visual walkthrough of every screen (screenshots plus a design-critique pass) at the start of UI-1.

### UI-1: Design system & app shell (with Phase 2)
Phase 2 adds about 8 new settings screens, so the shared building blocks come first and the new screens are built with them.
- Design tokens: colours, spacing, type scale, radius, shadows in one Tailwind theme; light theme first, dark theme as a real switch (or removed until it's complete).
- Shared components: Button, Input/Select/Textarea with labels and error text, Money input (₹, paise-safe), Modal, Confirm dialog, Toast, Table (sort, empty and loading states), Badge, Tabs, Drawer, Page header.
- Replace all 39 `alert`/`prompt`/`confirm` calls with toasts, inline errors and confirm dialogs (void reason gets a proper form).
- App shell: sidebar with labels and icons, built from the user's permissions; top bar showing shop name, logged-in user, switch-user (PIN) and the current business day.
- Settings layout used by all Phase 2 screens: left section list, form on the right, sticky Save/Cancel, unsaved-change warning.
- Indian number formatting everywhere (₹1,23,456.00 with lakh grouping) through one formatter.

**Done when:** no browser pop-ups remain, all new Phase 2 screens use only shared components, and the shell adapts to the user's permissions.

### UI-2: Billing screen redesign (with Phase 4)
- Search-first layout: item search or barcode field always focused; results by name, code or barcode.
- Keyboard flow at the counter: F2 search, + / − quantity, F4 discount, F8 hold, F9 pay, F10 print, Esc cancel; shortcuts shown on screen.
- Cart: edit quantity inline; line price change (when allowed) with a visible "price changed" marker; clear line totals and GST breakup.
- Pay panel: cash, UPI, card and split payment; quick-cash buttons; UPI QR on screen; large change-due figure.
- Held bills strip; food extras: order type and table number.
- Touch mode: larger targets (at least 44 px) and a category tile grid for touch terminals.

**Done when:** a regular bill can be done keyboard-only, and a counter test shows a typical 3-item cash bill in under 15 seconds.

### UI-3: Lists, reports & dashboard (with Phase 6)
- One consistent list pattern for Invoices, Customers, Items and Audit log: filters bar, saved date presets, pagination, export.
- Owner dashboard: today's sales, payment split, top items, hourly chart, low stock, vs. last week.
- Report pages with charts plus a printable/PDF layout; GST summary screen.
- Shift close screen: expected vs. counted cash, with denominations.

### UI-4: Accessibility, languages & polish (with Phase 7)
- Keyboard focus order and visible focus rings; screen-reader labels; colour contrast at WCAG AA (accessibility audit pass).
- Text pulled into language files: English first, structure ready for Hindi/Tamil and other Indian languages later.
- Onboarding tips for first use, empty-state guidance, consistent wording (UX copy pass).

## Later (v2+)
- Refunds / returns as credit notes (with a Credit Note series).
- Kitchen order tickets (KOT) with a daily KOT series.
- Purchase entry and supplier records (with a Purchase series).
- Custom roles (beyond editing the built-in ones).
- Web / cloud: cloud sync, multiple counters on a LAN, online owner dashboard, multi-branch. Phase 1 keeps the API separate so this needs no rewrite.

---

## Decisions
- 2026-11-23: v1 covers food, retail and services; Phase 1 grows to ~3 weeks; credit notes, KOT, purchase and custom roles move to v2.

## Open decisions
- GST: support both regular and composition dealers? (Recommended: yes; planned that way.)
- Pilot shops: one food, one retail, ideally one service business.
- Printer models for Phase 5.
- Pricing: one-time licence or subscription (Phase 7).
- Final product name (before Phase 7).
