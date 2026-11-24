# POS Project: instructions for Claude

**Start every new session by reading [docs/HANDOFF.md](docs/HANDOFF.md).** It holds the product decisions, what is done, what is pending and where to pick up. [docs/ROADMAP.md](docs/ROADMAP.md) is the detailed plan with per-step results.

## Rules (always)
- **Never run `git commit`, `git push`, `git tag`, `git remote add/set-url` or `gh pr/repo/api`.** This is the owner's personal GitHub account (Kishore-1011). When work is ready, give the owner the exact commands to paste, with a suggested message. No Claude co-author trailers. `.claude/settings.json` denies these commands; never work around it (for example by calling git through another path).
- Reading git (`status`, `diff`, `log`), cloning and pulling are fine.
- Never touch the `airas-pos` repo. It is the original shop-specific build for a friend's shop and stays as it is.
- No AIRAS branding anywhere. The product name is a placeholder ("POS Project"); it lives only in `client/src/config/brand.js`, `server/src/config/brand.js` and the root `package.json` build block.
- Keep the owner's personal details out of code, commits and requests to outside services.

## Working conventions
- Before handing over: `npm run check` (lint + 107 tests + client build) must pass. CI runs the same on Windows + Linux, Node 22 + 26.
- Money is integer paise in the DB (`*_paise`); the API returns rupees (`server/src/db/columns.js`). Do billing maths with `client/src/utils/billing.js` / `server/src/utils/money.js`.
- DB changes go in a new numbered file in `server/src/db/migrations/` (next: `010_...`). Never edit an applied migration.
- Every route uses `requirePermission(...)`; every change of business data writes an audit entry (`services/auditService.js`).
- UI is built from `client/src/components/ui` and the tokens in `client/src/index.css`. Keep the icon rail and photo-first catalog: the owner rejected a generic "SaaS dashboard" look.
- Verify UI changes in a real browser (scripts in `tools/ui-checks/`) and look at the screenshots, not only the tests.
- Update the ROADMAP progress notes and HANDOFF "Where to pick up" when a step is finished.
