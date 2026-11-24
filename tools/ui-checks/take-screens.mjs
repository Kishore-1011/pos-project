// Drives the real UI in headless Microsoft Edge and saves screenshots of every screen.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const BASE = 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 },
  args: ['--no-first-run', '--disable-extensions', '--hide-scrollbars']
});
const page = await browser.newPage();
const dialogs = [];
page.on('dialog', async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

async function shot(name, note = '') {
  await page.mouse.move(700, 12); // park the mouse on an empty part of the top bar (no hover tooltips)
  await sleep(700);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file });
  results.push(`OK   ${name}${note ? '  (' + note + ')' : ''}`);
}

/** Click the first visible element matching `selector` whose text contains `text`. */
async function clickText(selector, text, { nth = 0 } = {}) {
  const ok = await page.evaluate((sel, t, n) => {
    const els = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && e.innerText.includes(t));
    if (!els[n]) return false;
    els[n].click();
    return true;
  }, selector, text, nth);
  if (!ok) throw new Error(`no "${selector}" containing "${text}"`);
  await sleep(500);
}

async function nav(label) {
  await page.click(`button[title="${label}"]`);
  await sleep(1200);
}

async function step(name, fn) {
  try { await fn(); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); }
}

async function login(username, password) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.type('input[autocomplete="username"]', username);
  await page.type('input[autocomplete="current-password"]', password);
  await page.click('button[type="submit"]');
  await sleep(2000);
}

await step('01-login', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await shot('01-login');
});

await step('02-billing-empty', async () => {
  await login('admin', 'admin123');
  await shot('02-billing-empty', 'Owner');
});

await step('03-customer-prompt', async () => {
  await clickText('button', 'Masala Dosa');
  await shot('03-customer-prompt', 'opens on the first item of every bill');
  await clickText('button', 'Skip / Walk-in');
});

await step('03b-billing-cart', async () => {
  for (const name of ['Filter Coffee', 'Filter Coffee', 'Medu Vada', 'Gulab Jamun']) {
    await clickText('button', name);
  }
  await shot('03b-billing-cart');
});

await step('04-billing-saved', async () => {
  await clickText('button', 'Save / Paid');
  await sleep(1000);
  await shot('04-billing-saved');
});

await step('05-receipt-preview', async () => {
  await clickText('button', 'Print');
  await shot('05-receipt-preview');
  await page.keyboard.press('Escape');
});

await step('06-invoices', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await nav('Order & Invoice');
  await shot('06-invoices');
});

await step('07-invoice-detail', async () => {
  const clicked = await page.evaluate(() => {
    const rowBtn = [...document.querySelectorAll('table button')].find((b) => b.offsetParent !== null && /view|details|open/i.test(b.innerText + (b.title || '')));
    const target = rowBtn || document.querySelector('table tbody tr');
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) throw new Error('no invoice row');
  await sleep(1200);
  await shot('07-invoice-detail');
});

await step('08-customers', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await nav('Customer Master');
  await shot('08-customers');
});

await step('09-customer-detail', async () => {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('table button, table [role="button"], table span, table div')]
      .find((b) => b.offsetParent !== null && /^\d+ orders?$/i.test(b.innerText.trim()));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (!clicked) throw new Error('no customer history button');
  await sleep(1200);
  await shot('09-customer-detail');
});

await step('10-items', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await nav('Item Master');
  await shot('10-items');
});

await step('11-categories', async () => {
  await clickText('button', 'Categor');
  await shot('11-categories');
});

await step('12-item-form', async () => {
  await clickText('button', 'Items', { nth: 0 }).catch(() => {});
  await clickText('button', 'Add New Menu Item');
  await shot('12-item-form');
});

await step('13-reports', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(1000);
  await nav('Reports');
  await sleep(800);
  await shot('13-reports');
});

await step('14-users', async () => {
  await nav('Staff Users');
  await shot('14-users');
});

await step('15-audit', async () => {
  await nav('Audit Trail');
  await shot('15-audit');
});

await step('16-cashier-billing', async () => {
  await login('ravi', 'cashier123');
  await shot('16-cashier-billing', 'Cashier: reduced menu');
});

await browser.close();
console.log(results.join('\n'));
if (dialogs.length) console.log('\nBrowser pop-ups seen:\n  ' + dialogs.join('\n  '));
if (consoleErrors.length) console.log('\nConsole errors:\n  ' + [...new Set(consoleErrors)].slice(0, 10).join('\n  '));
