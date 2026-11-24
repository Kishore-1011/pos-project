# Handoff: POS Project

Last updated: 2026-11-24. This is a snapshot for picking the work up on a new machine or in a new Claude session. Read it top to bottom, then [ROADMAP.md](ROADMAP.md) for detail.

---

## 1. What this project is

A **generic, sellable point-of-sale product**, forked from `Kishore-1011/airas-pos`. That repo was built for a friend's fried-chicken cart and **stays untouched**. This repo is `Kishore-1011/pos-project` (fresh history, CI on GitHub Actions).

**Product decisions (agreed with the owner, 2026-11-23):**

| Topic | Decision |
|---|---|
| Name | Not decided. Placeholder "POS Project". Change only in `client/src/config/brand.js`, `server/src/config/brand.js`, root `package.json` build block. Needed before Phase 7. |
| Market | India only for now (GST, FSSAI, UPI, ₹ with lakh grouping, IST default). |
| Businesses | Food, retail **and** services. |
| Delivery | Windows desktop app (Electron) first; web/cloud maybe later. Offline-first. |
| GST | Optional. GST invoice rules (≤16 chars, FY-unique numbers, Tax Invoice) apply **only** to GST-registered shops; unregistered shops bill freely ("Bill of Supply"). |
| FSSAI and other licences | Optional, depend on business type (FSSAI is suggested for food, never forced). |
| v2 (not in this version) | Credit notes / refunds, KOT, purchase entry, custom roles. |
| Look | Keep the existing blue look and refine it. Laptop/desktop, mouse + keyboard (1366×768 minimum). **Icon rail with names on hover** and **photo-first item tiles**: the owner rejected a labelled-sidebar "generic SaaS" look. |
| Photo library | Not required (owner, 2026-11-24). Items without photos get designed category tiles. |

**Working rules for Claude** are in [`/CLAUDE.md`](../CLAUDE.md). The key one: Claude never commits or pushes; it hands the owner the commands.

---

## 2. What was planned

The plan is [ROADMAP.md](ROADMAP.md): Phases 0–7 plus a parallel UI track (UI-1 to UI-4), then v2.

| Phase | Theme | Status |
|---|---|---|
| 0 | Safety & correct billing | **Done** |
| 1 | Foundation: DB engine, migrations, organization/tax, number series, time zone/FY, roles & permissions, price change, CI | **Done** |
| 2 | Setup wizard & Settings screens | **Done** |
| UI-1 | Design system & app shell | **Done** (incl. course correction) |
| 3 | Catalog for food, retail & services (SKU/barcode/units, goods vs service, HSN/SAC + GST rate, variants/add-ons, stock, CSV import) | Next |
| 4 + UI-2 | Billing upgrades (GST breakup, round-off, price change at counter, barcode, hold bills, split payment, UPI QR, order type) + billing redesign | |
| 5 | Printing & hardware (ESC/POS, cash drawer) | |
| 6 + UI-3 | Shifts, reports, GST summary, backups + lists/dashboard | |
| 7 + UI-4 | Installer, auto-update, licensing, demo data, accessibility, languages | |

---

## 3. What was done (summary; details and test counts in ROADMAP)

**Phase 0: security and billing.**
- Per-install JWT secret; API on 127.0.0.1 only with Host/Origin checks.
- Login lock after 5 failures.
- Server-side billing rules: prices from the DB, cash ≥ total, discount limits, active items only.
- UPI/Card payments; a reason is required to void a bill; image-only uploads.

**Phase 1: foundation.**
- **DB:** better-sqlite3 (WAL, FK on). Numbered migrations `001`–`009` with an automatic backup before upgrading. Money as integer paise; all-or-nothing bill saves.
- **Organization, tax and licences:** GSTIN checksum, state/PAN cross-checks, licences list, compliance warnings.
- **Number series:** prefix, period, padding, reset rules, allocated inside transactions; GST rules only when registered.
- **Calendar:** shop time zone, FY start month (locked after the first bill), business-day cutoff.
- **Roles:** Owner/Manager/Cashier with 14 permissions and per-role max discount; `requirePermission()` on every route; PIN login.
- **Price change at billing (data side):** catalog vs charged price, audited.
- **Code health:** oxlint, `npm run check`, GitHub Actions (Windows + Linux, Node 22 + 26), async-error fix.

**Phase 2: setup and settings.**
- **First-run wizard:** Business → Address → Tax & licences → Bill numbers → Owner → Review. The seeded `admin123` stops working after setup.
- **Settings:** Business (logo), Tax & licences, Bill numbers (live preview), Region & year, Receipt (58/80 mm, footer, what to print, live preview), Staff, Roles & permissions, Audit log.
- **Receipts:** printed with the shop's own header, GSTIN/licences, Tax Invoice / Bill of Supply.

**UI-1: shell and design system.**
- **Shared components** in `client/src/components/ui` (Button, inputs, MoneyInput, Modal, toasts, confirm/prompt dialogs, Badge, Card, PageHeader, EmptyState). Design tokens in `index.css`. Formatters ₹1,23,456.00 and shop-time-zone dates.
- **No browser pop-ups:** all `alert`/`confirm`/`prompt` replaced. CSV export is protected from formula injection.
- **Billing:** fits 1366×768, with a pinned pay panel, inline customer lookup and a cash field that follows the total.
- **Course correction after owner feedback:**
  - Icon rail with hover labels restored.
  - Photo-first tiles with designed fallbacks (`ItemArt.jsx`, `utils/itemStyle.js`).
  - Category chips with icons.
  - Rail is now Billing, Invoices, Customers, Items, Reports, Settings; Staff and Audit log moved inside Settings.
- **Polish on every screen:** Invoices, Customers, Reports, Items, Categories, Staff (compact "⋯" actions menu), readable audit log.

**Research and design docs.**
- [PRODUCT_ANALYSIS.md](PRODUCT_ANALYSIS.md): original code analysis and bug list.
- [UI_REVIEW.md](UI_REVIEW.md): screen-by-screen findings with status.
- [DIFFERENTIATION_STUDY.md](DIFFERENTIATION_STUDY.md): how to stand out:
  - Honest books: sealed, tamper-evident bills.
  - Works offline.
  - Crafted counter: live receipt, PAID stamp.
  - Indian-first: UPI QR, WhatsApp bill.
- [prototypes/counter-concept.html](prototypes/counter-concept.html): an offline, clickable prototype of the new counter:
  - Live receipt cart, PAID stamp, sealed bills with a "Books verified" popover.
  - UPI QR, light/dark rail toggle, offline chip.
  - Keyboard shortcuts `/`, Enter, F9.

**State at handoff:**
- `npm run check` passes: lint clean, 107 tests (97 server, 10 client), build OK. CI green on the last pushed commit.
- Browser checks in `tools/ui-checks/` all pass.

---

## 4. Where to pick up (in this order)

1. **Owner review of the counter prototype.** Open `docs/prototypes/counter-concept.html` in a browser. The owner still has to decide:
   - Which pillars lead the product story (recommended: Honest books + Crafted counter, with Offline as proof).
   - Whether to adopt the live-receipt cart + PAID stamp.
   - Dark or light rail.

   Nothing from the prototype is in the app yet. Build it only after approval.
2. **If approved, "Honest books" (server):** a hash chain over bills (each bill stores a hash including the previous one), a "Books verified" check endpoint and screen, and a day seal (Z-report) with reopen-with-reason. Fits as migration `010`.
3. **Phase 3: catalog** (see ROADMAP). Units/decimal quantities, goods vs service, HSN/SAC + GST rate per item, tax-inclusive/exclusive, variants/add-ons, stock, CSV import/export.
4. **Then Phase 4 + UI-2** (billing upgrades and the redesigned counter, using the approved prototype direction).

**Known loose ends:**
- **Electron not yet tested with better-sqlite3.** The Electron binary download kept failing on the old network, so the app was tested with plain Node (server + Vite). Check `npm start` on the new machine, before or at installer time (Phase 7).
- **Client lint warnings:** about 40 React-hook warnings (warnings, not errors), mostly in `BillingView.jsx`. Clean them up when Billing is rebuilt in UI-2.
- **Old screenshot script:** `tools/ui-checks/take-screens.mjs` predates the icon rail, so its nav labels may need updating.
- **Open decisions** (ROADMAP bottom): composition dealers (planned yes), pilot shops, printer models, pricing model, final name.

---

## 5. How to run it (new machine)

Requires Node.js 22+ (CI uses 22 and 26) and git.

```powershell
git clone <your SSH alias or https>:Kishore-1011/pos-project.git
cd pos-project
npm install; npm --prefix server install; npm --prefix client install

# Terminal 1: API on http://127.0.0.1:5000
npm --prefix server start
# Terminal 2: UI on http://localhost:5173
npm --prefix client run dev

npm run check     # lint + tests + build (same as CI)
```

- **Fresh database:** opens the setup wizard. For a demo shop instead, start the server on an empty database and run `tools/ui-checks/seed-demo.mjs` before doing setup. See [tools/ui-checks/README.md](../tools/ui-checks/README.md).
- **Separate demo database:** set `POS_DB_PATH` and `POS_UPLOADS_PATH` before starting the server so the demo data stays in its own folder.
- **Demo logins after seeding:** admin/admin123 (Owner), priya/manager123 (Manager), ravi/cashier123 with PIN 1234 (Cashier).
- **Not in git:** the database, uploads and `.jwt_secret` (git-ignored). The demo data from the old machine is gone; reseed it.

---

## 6. Map of the code

```
client/src/
  App.jsx                 setup gating, screen map by permission
  components/MainLayout   icon rail + top bar (shop name, business day, Switch user)
  components/ui/          shared components; ItemArt.jsx + utils/itemStyle.js for tiles
  context/AuthContext     login / PIN / session, authFetch, can(permission)
  utils/                  billing.js (paise maths), format.js, datetime.js (shop calendar), csvExport.js
  views/                  Billing, Invoices, Customers, ItemManager, CategoryMaster, EODReport, UserManager, AuditLog, SetupWizard
  views/settings/         SettingsView + one file per section, receiptProfile.js
server/src/
  app.js / index.js       Express app (loopback only), startup
  config/                 brand, paths (POS_DB_PATH / POS_UPLOADS_PATH), secret
  db/migrations/          001–009 (next is 010)
  middleware/             auth (requirePermission), loginLimiter
  services/               permissions, users, settings, organization, numberSeries, calendar, audit, imageUpload
  routes/                 auth, users, roles, organization, number-series, settings, setup, orders, items, customers, categories, reports, audit
server/test/, client/test/  node:test suites
tools/ui-checks/          headless-browser checks and demo seeding
docs/prototypes/source/   generator for the counter-concept prototype
```
