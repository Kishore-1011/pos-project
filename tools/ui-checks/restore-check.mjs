// Captures the restored look (icon rail + photo-first catalog) and re-checks the counter essentials.
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const OUT = process.argv[2];
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--hide-scrollbars']
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const checks = [];
const check = (n, ok, d = '') => checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` (${d})` : ''}`);

const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const dialogs = []; page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss(); });
const errors = []; page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
await page.type('input[autocomplete="username"]', 'admin');
await page.type('input[autocomplete="current-password"]', 'admin123');
await page.click('button[type="submit"]');
await sleep(2500);

await page.mouse.move(700, 8); await sleep(500);
await page.screenshot({ path: path.join(OUT, '01-restored-billing.png') });
check('Icon rail is narrow (icons only)', await page.evaluate(() => document.querySelector('aside').getBoundingClientRect().width <= 80));
const photos = await page.evaluate(() => [...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth > 0).length);
check('Item photos show', photos >= 5, `${photos} photos loaded`);
const tiles = await page.evaluate(() => document.querySelectorAll('main [class*="bg-gradient-to-br"]').length);
check('Items without photos get designed tiles', tiles >= 10, `${tiles} designed tiles`);

// Hover a rail icon: its label appears
const box = await page.evaluate(() => { const b = document.querySelector('aside nav button:nth-child(2)'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
await page.mouse.move(box.x, box.y); await sleep(500);
await page.screenshot({ path: path.join(OUT, '01b-rail-hover-label.png') });

const click = (t) => page.evaluate((x) => { const b = [...document.querySelectorAll('main button')].find((e) => e.offsetParent && e.innerText.includes(x)); if (b) b.click(); return Boolean(b); }, t);
for (const n of ['Masala Chai', 'Samosa', 'Samosa', 'Idli', 'Masala Dosa']) { await click(n); await sleep(250); }
await page.mouse.move(700, 8); await sleep(500);
await page.screenshot({ path: path.join(OUT, '03-restored-cart.png') });
const save = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.innerText.trim() === 'Save bill'); const r = b.getBoundingClientRect(); return r.bottom <= innerHeight; });
check('Save still visible at 1366x768', save);
check('No browser pop-ups', dialogs.length === 0, dialogs.join(' | '));
check('No page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
console.log(checks.join('\n'));
