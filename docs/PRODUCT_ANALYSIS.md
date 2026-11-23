# POS Project: Analysis of the AIRAS POS codebase

Source: `Kishore-1011/airas-pos` @ `200893b` (v1.0.1), cloned 2026-11-23.
Git remote renamed to `airas-original` so nothing gets pushed back to the shop's repo by accident.

## 1. What it is today

An offline, single-shop POS built for one quick-service food cart ("AIRAS Fried Chicken").

| Layer | Tech |
|---|---|
| UI | React 19 + Vite 6 + Tailwind 4, lucide icons (`client/`) |
| API | Express 4, JWT auth, multer uploads (`server/`) |
| DB | SQLite via `sql.js` (WASM, in-memory, whole file rewritten to disk after every write) |
| Desktop | Electron 34 runs the Express server in-process, NSIS installer |

Modules: Billing (catalog grid, cart, discount, cash tender/change, receipt), Invoices (filter, void, reprint, CSV),
Customers (phone lookup, lifetime spend), Items & Categories (bulk price/category/status), Users (ADMIN/CASHIER),
EOD report, Audit log.

Size: about 7.5k lines. Most of it is in five oversized views (`BillingView.jsx` is 1,394 lines).

## 2. Verified by running it locally

The server ran on a **fresh scratch DB** (the committed `server/airas_pos.db` wasn't touched) and was driven through the API:

| # | Test | Result | Severity |
|---|---|---|---|
| 1 | Forged admin JWT signed with the hard-coded fallback secret `airas_pos_offline_secret_key_2026` | **200, full admin access** | Critical |
| 2 | CORS check from `https://evil.example` | `Access-Control-Allow-Origin: *`, and the server listens on all interfaces | Critical (with #1, any LAN device/website can talk to it) |
| 3 | 15 wrong admin passwords | No lockout or rate limit | High |
| 4 | Default `admin / admin123` | Created on first run, never forced to change | High |
| 5 | Cash order with `cash_received: 0` | Saved as **PAID** (only the UI checks the amount) | High |
| 6 | Cashier sends `discount: 9999` on a ₹15 bill | Accepted. Total ₹0, and `discount=9999` is stored and inflates EOD "total discounts" | High |
| 7 | Bill a **disabled** item by ID | Accepted | Medium |
| 8 | Quantity `2.7` | Silently truncated to 2 (no kg/litre items possible) | Medium |
| 9 | ₹10.10 × 3 + ₹15 × 3 | `change_given = 29.700000000000003`, EOD revenue `125.39999999999999` (float money) | Medium |
| 10 | Admin sets a VOID order back to PAID | Allowed, no reason required | Medium |
| 11 | Cashier lists all orders | Allowed (may be intended) | Low |

Code-read findings (not exercised):

- **UPI and Card are one button** in Billing and always saved as `UPI`, so card sales never show up as CARD in reports.
- **Every write rewrites the whole DB file**, and an order is several separate writes with no transaction. A crash mid-order can leave an order with no line items. This gets slower as the DB grows.
- Invoice number is `MAX(id)+1` and isn't atomic. It's fine for one till but would break with two.
- **India-only assumptions are hard-coded:** `Asia/Kolkata` plus `'+5 hours','+30 minutes'` in SQL, `₹` in about 90 places, 10-digit phone validation, `en-IN` formatting.
- **No tax/GST** (no HSN, CGST/SGST, or GSTIN on the bill). Most Indian shops would need this.
- Uploads: no file-type check and served statically, so an uploaded `.html` file becomes stored XSS. `multer@1.x` has known CVEs.
- API URL `http://localhost:5000` is hard-coded in 5 client spots, and port 5000 clashes are not handled in Electron.
- Repo hygiene: a **22 MB `Reference/cart-issue.mp4`**, the live shop DB, and duplicate logo files (×3) are all committed. Vite starter leftovers (`react.svg`, `vite.svg`, `hero.png`) and an empty `Receipt.jsx` remain.
- No tests, no lint in CI, no migrations system (it uses `ALTER TABLE` inside try/catch).

## 3. Where the AIRAS brand appears

| Place | What | Fix |
|---|---|---|
| `client/src/components/ThermalReceipt.jsx:10,58-59` | Receipt header **"AIRAS / FRIED CHICKEN"**, fallback invoice `AIRAS-0001` | Read shop name, address, GSTIN, phone and footer from a **Shop Settings** table |
| `server/src/routes/orderRoutes.js:16` | Invoice prefix `AIRAS-` | Configurable prefix (default `INV-`) |
| `client/src/views/BillingView.jsx:436`, `InvoicesView.jsx:240,520`, `CustomersView.jsx:759`, `EODReportView.jsx:139` | `AIRAS-` fallbacks | Remove; the server always returns `invoice_no` |
| `client/src/views/LoginView.jsx:4,46,51` | Shop logo, alt "AIRAS Fried Chicken", title "AIRAS POS" | Product logo + shop logo from settings |
| `LeftSidebar.jsx:33,38`, `MainLayout.jsx:35,40`, `Navbar.jsx:26`, `App.jsx:26` | "AIRAS" label, logo | Product name constant |
| `client/index.html:7` | `<title>AIRAS POS</title>` | Product name |
| `client/src/assets/` + `client/public/` | `Logo.jpeg`, `logo.png`, `Logo based Items.jpeg` (shop artwork) | Delete; add product icon |
| `CustomersView.jsx:270`, `EODReportView.jsx:153`, `InvoicesView.jsx:254`, `csvExport.js:2` | CSV names `AIRAS_*` | Product/shop name |
| `AuthContext.jsx`, `ThemeContext.jsx` | Storage keys `airas_token`, `airas_theme` | `pos_*` |
| `server/src/middleware/auth.js:4` | Secret `airas_pos_offline_secret_key_2026` | Generate per install, store in userData |
| `server/src/index.js:63,73`, `electron/main.js:10,47,69,107` | Logs, window title, `%APPDATA%\airas-pos`, `airas_pos.db` | Product name |
| `AIRAS_*` env vars (database.js, index.js, itemRoutes.js, seeds) | `AIRAS_DB_PATH` etc. | `POS_*` |
| Root `package.json` build block | `appId com.airas.pos`, `productName`, shortcut, `AIRAS-POS-Setup.exe` | Product values. **Author email is the personal address; review it.** |
| `start-airas.bat`, `stop-airas.bat`, `run-silent.vbs` | Names and echo text | Rename |
| `server/src/db/reset_and_seed.js` | Fried-chicken-cart menu with Unsplash URLs (unused) | Replace with an optional demo dataset per business type |
| `README.md`, `PROJECT_PLAN.md`, `Reference/` | Shop-specific docs and screenshots | Rewrite / remove |

**Status (2026-11-23): done.** Every item above is now "POS Project", driven by `client/src/config/brand.js` and `server/src/config/brand.js`. Invoices are `INV-0001`, data lives in `%APPDATA%\pos-project\pos_project.db`, and env vars are `POS_*`. The shop logos, `Reference/`, launch scripts, `PROJECT_PLAN.md`, the committed DB and unused template files are deleted. Still open: Shop Settings for the receipt header (it shows the product name for now) and a per-install JWT secret.

## 4. Roadmap to a product

**Phase 0: Make it safe and correct (do first)**
1. Per-install random JWT secret; bind to `127.0.0.1` by default; restrict CORS; login rate-limit; force a password change on first login.
2. Recompute and enforce on the server: cash ≥ total, discount ≤ subtotal (cap cashier discounts and let admins set the limit), active items only, quantity rules.
3. Integer paise (or decimal) money math everywhere.
4. Wrap order creation in a transaction and generate invoice numbers atomically.
5. Split UPI and CARD; require a reason for void and un-void.
6. Validate upload type, upgrade multer to 2.x.

**Phase 1: De-brand and configure**
- Shop Settings screen: business name, logo, address, phone, GSTIN, invoice prefix, receipt footer, currency, timezone, receipt width (58/80 mm).
- First-run setup wizard instead of a seeded admin.
- Replace every item in the table in section 3; purge the media, the video and the DB from the new repo history.

**Phase 2: Product features most shops will expect**
- GST: tax rates per item or category, inclusive/exclusive pricing, a tax breakup on the bill, and a GSTR-friendly export.
- Item variants and modifiers (size, add-ons), weighed items, barcode/SKU and scanner input.
- Basic stock tracking with low-stock alerts.
- Hold/park bills, split payment (part cash, part UPI), refunds/returns instead of void-only.
- UPI QR on screen and receipt, direct ESC/POS thermal printing (no browser print dialog).
- Shift open/close with a cash drawer count.
- Backup/restore to a file or a cloud folder, plus CSV import of the menu.

**Phase 3: Engineering**
- Replace `sql.js` with `better-sqlite3`, a real migrations folder, an API client module, and split the 800–1,400-line views into components.
- Tests (API + billing math), lint and CI, a signed installer and auto-update.
- Later: a multi-terminal/LAN mode and an optional cloud sync and licensing, if it's sold as SaaS.

## 5. Open decisions

- Product name (until then "POS Project").
- Target market: India-only (GST, ₹) or multi-country?
- Target business types: food/QSR only, or retail too? This decides variants vs. barcode/stock priority.
- Delivery: desktop installer only, or also a hosted/web version?
- New GitHub repo for the product (the code currently still points at `airas-pos` as `airas-original`).
