# UI Review: current screens (before UI-1)

Date: 2026-11-23. Screenshots in [screens-before/](screens-before/), taken with headless Microsoft Edge at **1366×768** (the most common laptop size) and 1920×1080, on a demo café (17 items, 6 customers, 13 bills, 3 staff).
Direction agreed: **keep the current blue look and refine it**; target **laptop/desktop with mouse and keyboard** (not touch terminals) for the pilot.

## Summary

The look is clean and consistent: one blue accent, rounded cards, good use of white space, clear totals. The problems are about **fitting a laptop screen, extra clicks at the counter, and consistency**, not the visual style. Two of them stop a cashier on every bill.

## Critical: blocks normal billing on a 1366×768 laptop

| # | Finding | Screenshot |
|---|---|---|
| C1 | **Save / Print / New Order and the cash section are below the visible area.** Measured: Save button at 864–902 px in a 768 px window. The cashier must scroll inside the cart panel to finish every bill. At 1920×1080 it fits. | [04-billing-1366-cart](screens-before/04-billing-1366-cart.png) vs [04-billing-1366-cart-scrolled](screens-before/04-billing-1366-cart-scrolled.png), [04-billing-1920-cart](screens-before/04-billing-1920-cart.png) |
| C2 | **Cash received didn't follow the bill total**, so every cash bill showed "Short by ₹…" and Save stayed disabled until the cashier typed the amount. (An original AIRAS bug.) **Fixed during this review:** the amount now tracks the total, rounded up, until the cashier edits it. | [04-billing-1366-saved](screens-before/04-billing-1366-saved.png) (after fix) |
| C3 | **A "Customer Information" pop-up blocks the first item of every bill.** Walk-in customers (most bills) cost an extra "Skip / Walk-in" click each time. | [03-customer-prompt](screens-before/03-customer-prompt.png) |

## High

| # | Finding | Screenshot |
|---|---|---|
| H1 | **Item cards are mostly empty placeholder.** The top half of every card is a grey "no photo" box repeating the item name; only 8 items fit on screen. With keyboard and mouse, a denser grid (or list) plus search-first is faster. The "READY" tag on every item adds no information. | [02-billing-empty](screens-before/02-billing-empty.png) |
| H2 | **Invoice numbers wrap onto two lines** in the invoice list ("INV/26-" / "27/0009") since the new financial-year format. | [06-invoices](screens-before/06-invoices.png) |
| H3 | **The top-bar search ("Search menu here…") shows on every screen** but only works in Billing. | [08-customers](screens-before/08-customers.png), [14-users](screens-before/14-users.png) |
| H4 | **Sidebar is icons only;** labels appear only on hover. New staff have to guess. A laptop has room for labels. | all |
| H5 | **Six different date formats:** `23-11-2026`, `23/11/2026`, `23 Nov 2026, 09:16 pm`, `2026-11-23`, `Mon, Nov 23, 2026`, `23/11/2026, 09:22 pm`. | [06](screens-before/06-invoices.png), [13](screens-before/13-reports.png), [14](screens-before/14-users.png), header |
| H6 | **Money without Indian digit grouping:** `₹1450.00`, `₹2420.00` instead of `₹1,450.00`, `₹2,420.00`. | [08-customers](screens-before/08-customers.png), [13-reports](screens-before/13-reports.png) |
| H7 | **Audit trail is developer-facing:** raw codes (`ORDER_CREATE`), "View JSON" snapshots, and a void shown as "Order #5" without its invoice number. Owners need a readable sentence ("Admin voided INV/26-27/0005: Customer cancelled"). | [15-audit](screens-before/15-audit.png) |

## Medium

| # | Finding | Screenshot |
|---|---|---|
| M1 | Food-only wording in a product for food, retail and services: "Menu Items", "Search menu", "Menu & Category Management", fork-and-knife icons. Should follow the business type ("Items/Products" for retail). | [10-items](screens-before/10-items.png) |
| M2 | Inconsistent names for the same thing: sidebar "Item Master", page "Menu & Category Management", tab "Category Master", card "Category Master Management"; "Detail Items" for the cart; "Gross Net Revenue". | [10](screens-before/10-items.png), [11](screens-before/11-categories.png), [13](screens-before/13-reports.png) |
| M3 | Category count says "6 Available" for 5 categories (counts "All Menu"). | [02-billing-empty](screens-before/02-billing-empty.png) |
| M4 | Staff list lacks the new profile data (phone, PIN set, last login); a loud red "Deactivate" on every row. | [14-users](screens-before/14-users.png) |
| M5 | Item form has no "Allow price change at billing" switch (data exists since Phase 1); no tax fields yet (Phase 3). | [12-item-form](screens-before/12-item-form.png) |
| M6 | Many ALL-CAPS micro labels and light-grey secondary text (e.g. "4 Items" under categories): hard to read, likely below WCAG AA contrast. | most screens |
| M7 | Destructive actions styled as primary-weight red buttons on every row ("Disable", "Deactivate"). | [10](screens-before/10-items.png), [14](screens-before/14-users.png) |
| M8 | Receipt header still shows the product name ("POS PROJECT"); shop name, address, GSTIN and licences come with Phase 2 settings. | [04-billing-1366-receipt](screens-before/04-billing-1366-receipt.png) |

## What works well (keep)

- One blue accent colour and consistent rounded cards; calm, uncluttered pages.
- Big, clear bill total; separate CASH / UPI / CARD buttons; quick-cash buttons.
- Receipt preview with 58/80 mm switch ([04-billing-1366-receipt](screens-before/04-billing-1366-receipt.png)).
- Invoice detail dialog and customer history drawer are clear and well structured ([07](screens-before/07-invoice-detail.png), [09](screens-before/09-customer-detail.png)).
- Reports summary cards read well at a glance ([13](screens-before/13-reports.png)).
- Menu already adapts to permissions: the cashier sees only Billing, Customers, Invoices ([16](screens-before/16-cashier-billing.png)).

## How this changes the UI-1 plan

Added to UI-1 (beyond the shared components and the 39 pop-ups already planned):
1. **Billing fits 1366×768 (C1):** pay panel (total, payment mode, cash, Save/Print/New Order) pinned to the bottom of the cart column, with only the cart lines scrolling; compact cart rows. Checked by the screenshot script at 1366×768.
2. **No customer pop-up (C3):** optional customer field in the cart header (type phone → suggestions → attach); walk-in is the default.
3. **Denser item grid (H1):** smaller cards when there's no photo, no repeated name, no "READY" tag; search-first focus.
4. **App shell (H3, H4):** labelled sidebar; search only on Billing; top bar with shop name, user, switch user (PIN), business date.
5. **One date and one money formatter (H5, H6):** `23 Nov 2026, 9:16 pm` / `23 Nov 2026` and `₹1,23,456.00` everywhere.
6. **Invoice column and table widths (H2).**
7. **Readable audit log (H7):** plain-language rows with invoice numbers; JSON only under "Details".
8. **Wording pass (M1, M2):** terms follow the business type; one name per concept.
9. **Contrast and destructive-action styling (M6, M7).**

Left for later phases as planned: keyboard shortcuts, split payment, held bills, UPI QR (UI-2 / Phase 4); tax fields (Phase 3); receipt header from shop settings (Phase 2).

## Re-taking screenshots

The script lives outside the repo (session scratch). To repeat the review after UI-1, ask Claude to re-run it; it seeds a demo café on a separate database and captures the same 17 views at 1366×768 and 1920×1080.
