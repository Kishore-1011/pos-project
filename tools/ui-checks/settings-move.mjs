import puppeteer from 'puppeteer-core';
import path from 'node:path';
const OUT = process.argv[2];
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--hide-scrollbars'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = []; const check = (n, ok, d = '') => checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` (${d})` : ''}`);
const errors = [];
async function as(user, pass) {
  const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 768 });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.type('input[autocomplete="username"]', user); await page.type('input[autocomplete="current-password"]', pass);
  await page.click('button[type="submit"]'); await sleep(2200);
  return page;
}
const rail = (page) => page.$$eval('aside nav button', (b) => b.map((x) => x.getAttribute('aria-label')));
const openSection = (page, t) => page.evaluate((x) => { const b = [...document.querySelectorAll('nav[aria-label="Settings sections"] button')].find((e) => e.innerText.trim().startsWith(x)); if (b) b.click(); return Boolean(b); }, t);

const owner = await as('admin', 'admin123');
const r = await rail(owner);
check('Rail has no Staff or Audit log', !r.includes('Staff') && !r.includes('Audit log'), r.join(', '));
await owner.click('aside button[aria-label="Settings"]'); await sleep(1200);
check('Settings lists Staff', await openSection(owner, 'Staff')); await sleep(1200);
await owner.mouse.move(683, 5); await owner.screenshot({ path: path.join(OUT, 'm1-settings-staff.png') });
const fit = await owner.evaluate(() => { const p = document.querySelector('nav[aria-label="Settings sections"]').nextElementSibling.firstElementChild; const t = p.querySelector('table'); return { panel: p.getBoundingClientRect().right, table: t ? t.getBoundingClientRect().right : 0, vw: innerWidth }; });
check('Staff panel fits the screen', fit.panel <= fit.vw && fit.table <= fit.panel + 1, JSON.stringify(fit));
const rowH = await owner.$$eval('tbody tr', (r) => Math.max(...r.map((x) => x.getBoundingClientRect().height)));
check('Staff rows stay compact', rowH < 90, `${Math.round(rowH)}px`);
await owner.click('button[aria-haspopup="menu"]'); await sleep(400);
const menu = await owner.$$eval('[role="menuitem"]', (b) => b.map((x) => x.innerText.trim()));
check('More menu lists PIN / password / deactivate', menu.some((m) => m.includes('PIN')) && menu.includes('Reset password'), menu.join(', '));
await owner.screenshot({ path: path.join(OUT, 'm1b-staff-menu.png') });
await owner.keyboard.press('Escape'); await sleep(200);
check('Escape closes the menu', (await owner.$$('[role="menu"]')).length === 0);
check('Settings lists Audit log', await openSection(owner, 'Audit log')); await sleep(1500);
await owner.screenshot({ path: path.join(OUT, 'm2-settings-audit.png') });

const mgr = await as('priya', 'manager123');
await mgr.click('aside button[aria-label="Settings"]'); await sleep(1500);
const mgrSections = await mgr.$$eval('nav[aria-label="Settings sections"] button', (b) => b.map((x) => x.innerText.split('\n')[0]));
check('Manager sees only Audit log in Settings', mgrSections.length === 1 && mgrSections[0] === 'Audit log', mgrSections.join(', '));
await mgr.mouse.move(683, 5); await mgr.screenshot({ path: path.join(OUT, 'm3-manager-settings.png') });
check('No page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(checks.join('\n'));
