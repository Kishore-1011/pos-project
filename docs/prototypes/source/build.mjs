// Builds the self-contained counter prototype: embeds lucide icon paths, the Plus Jakarta Sans fonts
// and the demo photos into one HTML file that works offline.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , clientDir, photosDir, outFile] = process.argv;
const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1'));
let html = fs.readFileSync(path.join(here, 'template.html'), 'utf8');

const iconNames = ['scroll-text', 'log-out', 'calendar-days', 'trending-up', 'shield-check', 'repeat', 'search', 'phone', 'save', 'printer',
  'rotate-ccw', 'shopping-cart', 'file-text', 'user-check', 'package', 'chart-column', 'users', 'clipboard-list', 'cup-soda', 'soup', 'cake',
  'utensils-crossed', 'cookie', 'milk', 'coffee', 'layout-grid', 'plus', 'minus', 'banknote', 'smartphone', 'credit-card', 'cloud-off',
  'x', 'circle-check'];
const icons = {};
for (const name of iconNames) {
  const mod = await import(pathToFileURL(path.join(clientDir, 'node_modules/lucide-react/dist/esm/icons', `${name}.js`)).href);
  icons[name] = mod.__iconNode;
}

const photos = {};
for (const [key, file] of Object.entries({ chai: 'a', coffee: 'b', lime: 'c', samosa: 'd', idli: 'e' })) {
  photos[key] = `data:image/jpeg;base64,${fs.readFileSync(path.join(photosDir, `${file}.jpg`)).toString('base64')}`;
}

const fontDir = path.join(clientDir, 'node_modules/@fontsource/plus-jakarta-sans/files');
const fonts = [400, 500, 600, 700, 800].map((w) => {
  const data = fs.readFileSync(path.join(fontDir, `plus-jakarta-sans-latin-${w}-normal.woff2`)).toString('base64');
  return `@font-face{font-family:"Plus Jakarta Sans";font-weight:${w};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${data}) format("woff2");}`;
}).join('\n');

html = html.replace('/*__FONTS__*/', fonts).replace('__ICONS_JSON__', JSON.stringify(icons)).replace('__PHOTOS_JSON__', JSON.stringify(photos));
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`wrote ${outFile} (${Math.round(html.length / 1024)} KB)`);
