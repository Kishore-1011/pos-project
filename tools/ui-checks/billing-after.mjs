// Verifies the reworked Billing screen at 1366x768 (and 1920x1080): no customer pop-up, Save always
// visible even with a long cart, inline customer lookup, save -> print.
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

async function session(width, height) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.type('input[autocomplete="username"]', 'ravi');
  await page.type('input[autocomplete="current-password"]', 'cashier123');
  await page.click('button[type="submit"]');
  await sleep(2000);
  return { page, dialogs, errors };
}

const clickText = (page, t, exact = false) => page.evaluate((txt, ex) => {
  const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && (ex ? e.innerText.trim() === txt : e.innerText.includes(txt)));
  if (b) b.click();
  return Boolean(b);
}, t, exact);
const saveVisible = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((e) => /^(Save bill|Saved)$/.test(e.innerText.trim()));
  if (!b) return { found: false };
  const r = b.getBoundingClientRect();
  return { found: true, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, ok: r.bottom <= window.innerHeight && r.top >= 0 };
});
const shot = async (page, name) => { await page.mouse.move(700, 12); await sleep(500); await page.screenshot({ path: path.join(OUT, `${name}.png`) }); };

// ---------- 1366 x 768 ----------
{
  const { page, dialogs, errors } = await session(1366, 768);
  await shot(page, '02-billing-empty');
  let s = await saveVisible(page);
  check('Save visible with empty cart', s.ok, `${s.top}-${s.bottom}/${s.vh}`);

  await clickText(page, 'Masala Dosa');
  await sleep(500);
  const modalOpen = await page.evaluate(() => Boolean(document.querySelector('[role="dialog"]')) || document.body.innerText.includes('Customer Information'));
  check('No customer pop-up on the first item', !modalOpen);

  for (const n of ['Filter Coffee', 'Filter Coffee', 'Medu Vada']) { await clickText(page, n); await sleep(250); }
  await shot(page, '03-billing-cart');
  s = await saveVisible(page);
  check('Save visible with 3 lines', s.ok, `${s.top}-${s.bottom}/${s.vh}`);
  const cash = await page.evaluate(() => document.querySelector('input[aria-label="Cash received"]')?.value);
  check('Cash received follows the total (₹80 + 2×₹30 + ₹35 = ₹175)', cash === '175', `cash field = ${cash}`);

  for (const n of ['Badam Milk', 'Bajji Plate', 'Curd Rice', 'Fresh Lime Soda', 'Gulab Jamun', 'Idli', 'Kesari', 'Masala Chai', 'Samosa', 'Veg Puff']) {
    await clickText(page, n); await sleep(150);
  }
  await shot(page, '03c-billing-long-cart');
  s = await saveVisible(page);
  check('Save visible with 13 lines (cart scrolls, buttons stay)', s.ok, `${s.top}-${s.bottom}/${s.vh}`);

  await page.type('input[aria-label="Customer phone number (optional)"]', '98840');
  await sleep(900);
  await shot(page, '03d-customer-lookup');
  const suggestions = await page.evaluate(() => document.querySelectorAll('[role="listbox"] [role="option"]').length);
  check('Typing a phone shows matching customers', suggestions > 0, `${suggestions} matches`);
  await page.evaluate(() => document.querySelector('[role="listbox"] [role="option"]')?.click());
  await sleep(400);

  await clickText(page, 'UPI', true); await sleep(300);
  await shot(page, '03e-billing-upi');
  await clickText(page, 'Cash', true); await sleep(300);

  await clickText(page, 'Save bill', true);
  await sleep(1500);
  await shot(page, '04-billing-saved');
  const savedNo = await page.evaluate(() => document.body.innerText.match(/INV\/\d{2}-\d{2}\/\d{4}/)?.[0] || null);
  check('Bill saves', Boolean(savedNo), savedNo || 'no invoice number shown');
  await clickText(page, 'Print', true);
  await sleep(1200);
  await shot(page, '05-receipt-preview');
  check('No browser pop-ups', dialogs.length === 0, dialogs.join(' | '));
  check('No page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
  await page.close();
}

// ---------- 1920 x 1080 ----------
{
  const { page } = await session(1920, 1080);
  for (const n of ['Masala Dosa', 'Filter Coffee', 'Medu Vada']) { await clickText(page, n); await sleep(250); }
  await shot(page, '04-billing-1920-cart');
  const s = await saveVisible(page);
  check('Save visible at 1920x1080', s.ok, `${s.top}-${s.bottom}/${s.vh}`);
  await page.close();
}

await browser.close();
console.log(checks.join('\n'));
