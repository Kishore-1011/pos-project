# POS Project

Offline-first point-of-sale for Indian food and retail shops, delivered as a Windows desktop app.
"POS Project" is a working name. Change it in `client/src/config/brand.js`, `server/src/config/brand.js` and the root `package.json` build block.

Stack: React 19 + Vite + Tailwind (`client/`), Express + SQLite via better-sqlite3 (`server/`), Electron + NSIS installer (`electron/`).

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
  db/                   better-sqlite3 wrapper, numbered migrations/, columns.js (paise -> rupees), first-run seed
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

# Terminal 1: API on http://127.0.0.1:5000 (loopback only)
npm --prefix server start

# Terminal 2: UI on http://localhost:5173 (proxies /api and /uploads to :5000)
npm --prefix client run dev

# Or run as the desktop app. If client/dist is built, the embedded server serves it;
# otherwise the window loads the Vite dev server.
npm start

# Checks (same as CI): lint + all tests + client build
npm run check
# or individually
npm run lint
npm test
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, server and client tests, and the client build on Windows and Linux with Node 22 and 26 for every push to `main` and every pull request.

The database (`server/pos_project.db`) and uploads (`server/uploads/items/`) are created on first run and are git-ignored.
On start, pending database migrations run automatically; if the database already has data, a copy is saved to `backups/` next to it first.
Money is stored as integer paise (`*_paise` columns); the API returns rupees.
In the desktop app they live in `%APPDATA%\pos-project\`.

A fresh install opens the first-run setup wizard (business, address, tax, bill numbers, owner account). The seeded `admin` / `admin123` login stops working once setup is complete.

Project status, decisions and next steps: [docs/HANDOFF.md](docs/HANDOFF.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## Build the Windows installer

```bash
npm run dist   # outputs dist/POS-Project-Setup.exe
```
