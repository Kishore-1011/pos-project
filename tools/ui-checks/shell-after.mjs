// Verifies the new app shell, Switch user (PIN), in-app dialogs, and captures every screen at 1366x768.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.argv[2];
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true, args: ['--hide-scrollbars']
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (name, ok, detail = '') => checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const browserDialogs = [];
page.on('dialog', async (d) => { browserDialogs.push(d.message()); await d.dismiss(); });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const shot = async (name) => { await page.mouse.move(700, 8); await sleep(600); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };
const click = (text, { exact = true, scope = 'button' } = {}) => page.evaluate((t, ex, sc) => {
  const el = [...document.querySelectorAll(sc)].find((e) => e.offsetParent !== null && (ex ? e.innerText.trim() === t : e.innerText.includes(t)));
  if (el) el.click();
  return Boolean(el);
}, text, exact, scope);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.type('input[autocomplete="username"]', 'admin');
await page.type('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await sleep(2200);

await shot('01-shell-billing-owner');
check('Sidebar shows labels', await bodyHas('Audit log') && await bodyHas('Invoices'));
check('Top bar shows shop name from settings', await bodyHas('Ganesh Bhavan'));
check('Top bar shows business day', await bodyHas('Business day'));
check('Search box is on the Billing screen', await page.evaluate(() => Boolean(document.querySelector('input[aria-label="Search items"]'))));

for (const [label, name] of [['Invoices', '06-invoices'], ['Customers', '08-customers'], ['Items', '10-items'],
  ['Reports', '13-reports'], ['Staff', '14-users'], ['Audit log', '15-audit']]) {
  await click(label);
  await sleep(1300);
  await shot(name);
}
check('No item search outside Billing', !(await page.evaluate(() => Boolean(document.querySelector('input[aria-label="Search items"]')))));

// Deactivate confirm dialog (Staff)
await click('Staff'); await sleep(1200);
const hasDeactivate = await click('Deactivate');
await sleep(500);
await shot('14b-deactivate-confirm');
check('Deactivate asks in an in-app dialog', hasDeactivate && await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))));
await page.keyboard.press('Escape'); await sleep(300);
check('Esc closes the dialog', !(await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')))));

// Void prompt (Reports)
await click('Reports'); await sleep(1500);
const voidClicked = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && /void/i.test(e.innerText + (e.title || '')) && !/voided/i.test(e.innerText));
  if (b) { b.scrollIntoView(); b.click(); }
  return Boolean(b);
});
await sleep(600);
if (voidClicked) {
  await shot('13b-void-reason');
  await click('Void bill'); await sleep(300); // submit empty -> must show "required"
  check('Void needs a reason (in-app prompt)', await bodyHas('This is required') || await bodyHas('At least 3 characters'));
  await page.keyboard.press('Escape'); await sleep(300);
} else {
  check('Void button found on Reports', false, 'no void button visible');
}

// Collapsed sidebar
await click('Collapse menu'); await sleep(400);
await click('Billing', { exact: false, scope: 'button[aria-current], nav button' }).catch(() => {});
await page.evaluate(() => [...document.querySelectorAll('nav button')][0]?.click());
await sleep(1200);
await shot('01b-shell-collapsed');
check('Collapsed menu is icons only', await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().width < 90));
await page.evaluate(() => [...document.querySelectorAll('aside button')].find((b) => b.innerText.includes('Expand menu') || b.title === 'Expand menu')?.click());
await sleep(300);

// Switch user with PIN
await click('Switch user'); await sleep(900);
await shot('16a-switch-user');
const pickedRavi = await click('Ravi Kumar', { exact: false });
await sleep(400);
await page.type('[role="dialog"] input[type="password"]', '0000');
await click('Switch'); await sleep(1200);
check('Wrong PIN is refused', await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]'))) && await bodyHas('Invalid'));
await page.evaluate(() => { const i = document.querySelector('[role="dialog"] input[type="password"]'); if (i) { i.value = ''; } });
await page.click('[role="dialog"] input[type="password"]', { clickCount: 3 });
await page.keyboard.press('Backspace');
await page.type('[role="dialog"] input[type="password"]', '1234');
await click('Switch'); await sleep(2000);
await shot('16b-switched-to-cashier');
check('Switch user with PIN works', pickedRavi && await page.evaluate(() => document.querySelector('header')?.innerText.includes('Ravi Kumar')));
check('Cashier menu has no admin screens', !(await bodyHas('Audit log')) && !(await bodyHas('Staff\n')));

check('No browser pop-ups anywhere', browserDialogs.length === 0, browserDialogs.join(' | '));
check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(checks.join('\n'));
