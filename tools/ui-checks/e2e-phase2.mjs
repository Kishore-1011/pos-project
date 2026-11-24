// End-to-end check after the parallel work. Mode "wizard": fresh database -> setup wizard -> owner signed in,
// admin123 refused. Mode "demo": every screen and every Settings section on the demo shop.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const [, , mode, OUT] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const dialogs = []; page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = []; const check = (n, ok, d = '') => checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` (${d})` : ''}`);
const shot = async (n) => { await page.mouse.move(683, 5); await sleep(600); await page.screenshot({ path: path.join(OUT, `${n}.png`) }); };
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.includes(x), t);
const clickText = (t, sel = 'button') => page.evaluate((x, s) => { const b = [...document.querySelectorAll(s)].find((e) => e.offsetParent && e.innerText.trim().startsWith(x)); if (b) b.click(); return Boolean(b); }, t, sel);
async function field(label) {
  const h = await page.evaluateHandle((l) => {
    const lab = [...document.querySelectorAll('label')].find((x) => x.offsetParent && x.textContent.replace('*', '').trim() === l);
    return lab ? document.getElementById(lab.htmlFor) : null;
  }, label);
  return h.asElement();
}
async function fill(label, value) { const el = await field(label); if (!el) throw new Error(`no field "${label}"`); await el.click({ clickCount: 3 }); await el.type(value); }
async function pick(label, value) { const el = await field(label); if (!el) throw new Error(`no select "${label}"`); await el.select(value); }
const api = async (p, body) => { const r = await fetch(`http://127.0.0.1:5000/api${p}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };

await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await sleep(1200);

if (mode === 'wizard') {
  check('Fresh install shows the setup wizard', await bodyHas('Set up your counter'));
  await shot('w1-business');
  try {
    await fill('Shop name', 'Anand Stores');
    await clickText('Retail');
    await clickText('Continue'); await sleep(400);
    await shot('w2-address');
    await fill('Address line 1', '4, Bazaar Street'); await fill('City', 'Madurai');
    await pick('State', '33'); await fill('PIN code', '625001'); await fill('Phone', '9876500000');
    await clickText('Continue'); await sleep(400);
    await shot('w3-tax');
    await clickText('Continue'); await sleep(400);
    await shot('w4-numbers');
    await clickText('Continue'); await sleep(400);
    await fill('Your name', 'Anand Kumar'); await fill('Username', 'anand');
    await fill('Password', 'secret123'); await fill('Confirm password', 'secret123'); await fill('Quick-switch PIN', '2580');
    await shot('w5-owner');
    await clickText('Continue'); await sleep(400);
    await shot('w6-review');
    await clickText('Finish'); await sleep(2500);
    await shot('w7-signed-in');
  } catch (e) { check('Wizard steps', false, e.message); }
  check('After setup, the owner lands in the app', await page.evaluate(() => Boolean(document.querySelector('aside'))) && await bodyHas('Anand Stores'));
  check('admin / admin123 no longer works', (await api('/auth/login', { username: 'admin', password: 'admin123' })).status === 401);
  check('New owner can log in', (await api('/auth/login', { username: 'anand', password: 'secret123' })).status === 200);
  check('New owner PIN works', (await api('/auth/pin-login', { username: 'anand', pin: '2580' })).status === 200);
  check('Setup cannot run twice', (await api('/setup/complete', { owner: {} })).status === 409);
} else {
  await page.type('input[autocomplete="username"]', 'admin');
  await page.type('input[autocomplete="current-password"]', 'admin123');
  await page.click('button[type="submit"]'); await sleep(2500);
  check('Demo shop (existing bills) skips the wizard', await page.evaluate(() => Boolean(document.querySelector('aside'))));
  const rail = async (label) => { await page.click(`aside button[aria-label="${label}"]`); await sleep(1500); };
  for (const [label, name] of [['Invoices', 'd-invoices'], ['Customers', 'd-customers'], ['Items', 'd-items'], ['Reports', 'd-reports'], ['Staff', 'd-staff'], ['Audit log', 'd-audit']]) {
    await rail(label); await shot(name);
  }
  check('Audit log reads as sentences', await bodyHas('created bill'));
  await rail('Settings'); await shot('s0-settings');
  for (const [section, name] of [['Business', 's1-organization'], ['Tax', 's2-tax'], ['Bill numbers', 's3-numbers'], ['Region', 's4-region'], ['Receipt', 's5-receipt'], ['Roles', 's6-roles']]) {
    const ok = await clickText(section); await sleep(900);
    check(`Settings section "${section}" opens`, ok);
    await shot(name);
  }
  await rail('Billing');
  const add = (t) => page.evaluate((x) => { const b = [...document.querySelectorAll('main button')].find((e) => e.offsetParent && e.innerText.includes(x)); if (b) b.click(); }, t);
  for (const n of ['Masala Chai', 'Samosa', 'Idli']) { await add(n); await sleep(250); }
  await clickText('Save bill'); await sleep(1500);
  await clickText('Print'); await sleep(1500);
  await shot('d-receipt');
  check('Receipt shows the shop from settings', await bodyHas('GANESH BHAVAN') || await bodyHas('Ganesh Bhavan'));
}
check('No browser pop-ups', dialogs.length === 0, dialogs.join(' | '));
check('No page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(checks.join('\n'));
