// Clicks through the counter prototype at 1366x768 and captures each state.
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , file, OUT] = process.argv;
const browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1366, height: 768 });
const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (n) => { await page.mouse.move(1000, 30); await sleep(450); await page.screenshot({ path: path.join(OUT, `${n}.png`) }); };
const checks = []; const check = (n, ok, d = '') => checks.push(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` (${d})` : ''}`);

await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
await sleep(600);
await shot('p1-empty');

for (const id of [8, 11, 11, 6, 9]) { await page.click(`.tile[data-id="${id}"]`); await sleep(380); }
await shot('p2-receipt');
const t = await page.$eval('#grand', (e) => e.textContent);
check('Total for chai + 2 samosa + idli + dosa', t === '₹185.00', t);
const fits = await page.$eval('#saveBtn', (b) => b.getBoundingClientRect().bottom <= innerHeight);
check('Save visible at 1366x768', fits);

await page.click('[data-m="UPI"]'); await sleep(300);
await shot('p3-upi');
await page.click('[data-m="CASH"]'); await sleep(200);
await page.keyboard.press('F9'); await sleep(900);
await shot('p4-paid-stamp');
check('PAID stamp shown', await page.$eval('#stamp', (s) => s.classList.contains('on')));
check('Bill sealed', (await page.$eval('#seal', (s) => s.textContent)).includes('Sealed'));

await page.click('#sealChip'); await sleep(300);
await shot('p5-books-verified');
await page.mouse.click(700, 400); await sleep(200);

await page.click('#railSeg [data-v="dark"]'); await page.click('#netSeg [data-v="off"]'); await sleep(200);
await page.click('#newBtn'); await sleep(700);
await page.focus('#q'); await page.keyboard.type('vada'); await page.keyboard.press('Enter'); await sleep(400);
await page.keyboard.type('x'); // stays in search; harmless
await shot('p6-dark-rail-offline-keyboard');
check('Keyboard: search + Enter adds the first match', (await page.$$eval('.ln', (l) => l.length)) === 1);
check('New bill number advanced', (await page.$eval('#billNo', (e) => e.textContent)) === 'INV/26-27/0018');
check('No JS errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(checks.join('\n'));
