// Billing screen: action area below the fold at 1366x768, the save -> receipt flow, and 1920x1080.
import puppeteer from 'puppeteer-core';
import path from 'node:path';

const OUT = process.argv[2];
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true, args: ['--hide-scrollbars']
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(width, height, prefix, { fullFlow }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  const dialogs = [];
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
  await page.type('input[autocomplete="username"]', 'ravi');
  await page.type('input[autocomplete="current-password"]', 'cashier123');
  await page.click('button[type="submit"]');
  await sleep(2000);
  const click = (t) => page.evaluate((txt) => {
    const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && e.innerText.includes(txt));
    if (b) b.click();
    return Boolean(b);
  }, t);
  await click('Masala Dosa'); await sleep(500);
  await click('Skip / Walk-in'); await sleep(400);
  for (const n of ['Filter Coffee', 'Medu Vada']) { await click(n); await sleep(300); }

  // Where is the Save button relative to the visible window?
  const saveBox = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((e) => e.innerText.includes('Save / Paid'));
    const r = b.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewport: window.innerHeight };
  });
  await page.mouse.move(700, 12);
  await page.screenshot({ path: path.join(OUT, `${prefix}-cart.png`) });

  let saved = null;
  if (fullFlow) {
    // Scroll the cart panel to its bottom, as a cashier would have to
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.innerText.includes('Save / Paid'));
      b.scrollIntoView({ block: 'end' });
    });
    await sleep(500);
    await page.screenshot({ path: path.join(OUT, `${prefix}-cart-scrolled.png`) });
    await click('Save / Paid'); await sleep(1500);
    await page.screenshot({ path: path.join(OUT, `${prefix}-saved.png`) });
    saved = await page.evaluate(() => document.body.innerText.match(/INV\/\d{2}-\d{2}\/\d{4}/)?.[0] || null);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent !== null && e.innerText.trim() === 'Print');
      if (b) b.click();
    });
    await sleep(1200);
    await page.screenshot({ path: path.join(OUT, `${prefix}-receipt.png`) });
  }
  console.log(`${width}x${height}: Save button at y=${saveBox.top}-${saveBox.bottom}, window height ${saveBox.viewport} -> ${saveBox.bottom <= saveBox.viewport ? 'visible' : 'BELOW THE FOLD'}${saved ? `; saved as ${saved}` : ''}${dialogs.length ? `; pop-ups: ${dialogs.join(' | ')}` : ''}`);
  await page.close();
}

await run(1366, 768, '04-billing-1366', { fullFlow: true });
await run(1920, 1080, '04-billing-1920', { fullFlow: false });
await browser.close();
