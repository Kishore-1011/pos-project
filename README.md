# POS Project

Offline-first point-of-sale for Indian food and retail shops, delivered as a Windows desktop app.
"POS Project" is a working name. Change it in `client/src/config/brand.js`, `server/src/config/brand.js` and the root `package.json` build block.

Stack: React 19 + Vite + Tailwind (`client/`), Express + SQLite via sql.js (`server/`), Electron + NSIS installer (`electron/`).

## Structure

```
electron/main.js        Desktop shell: starts the API in-process, opens the window, crash log
client/src/
  config/brand.js       Product name, invoice prefix, storage keys
  components/           Layout, navbar, thermal receipt, error boundary
  context/              Auth (JWT) + API fetch helper
  views/                Billing, Invoices, Customers, Items/Categories, Users, EOD report, Audit log
server/src/
  config/               brand.js, paths.js (DB + uploads location)
  db/                   sql.js wrapper, schema, first-run seed (admin account)
  routes/               auth, users, items, categories, customers, orders, reports, audit-logs
  middleware/auth.js    JWT + role guard
docs/PRODUCT_ANALYSIS.md  Findings and roadmap
```

## Run in development

Requires Node.js 18 or newer.

```bash
npm install
npm --prefix server install
npm --prefix client install

# Terminal 1: API on http://localhost:5000
npm --prefix server start

# Terminal 2: UI on http://localhost:5173 (proxies /api to :5000)
npm --prefix client run dev

# Or run as the desktop app (uses the dev server if client/dist is not built)
npm start
```

The database (`server/pos_project.db`) and uploads (`server/uploads/items/`) are created on first run and are git-ignored.
In the desktop app they live in `%APPDATA%\pos-project\`.

First login is `admin` / `admin123`. Change it immediately. A first-run setup wizard is planned.

## Build the Windows installer

```bash
npm run dist   # outputs dist/POS-Project-Setup.exe
```
