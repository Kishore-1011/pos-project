// Attaches verified demo photos to demo items through the normal item API (demo database only).
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2];
const B = 'http://127.0.0.1:5000/api';
const { token } = await (await fetch(`${B}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' })
})).json();
const { items } = await (await fetch(`${B}/items`, { headers: { Authorization: `Bearer ${token}` } })).json();

const map = { 'Masala Chai': 'a', 'Filter Coffee': 'b', 'Fresh Lime Soda': 'c', 'Samosa': 'd', 'Idli (2 pcs)': 'e' };
for (const [name, file] of Object.entries(map)) {
  const item = items.find((i) => i.name === name);
  if (!item) { console.log(`missing item ${name}`); continue; }
  const fd = new FormData();
  fd.append('image', new Blob([fs.readFileSync(path.join(DIR, `${file}.jpg`))], { type: 'image/jpeg' }), `${file}.jpg`);
  const r = await fetch(`${B}/items/${item.id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const body = await r.json();
  console.log(`${name}: ${r.status} ${body.image_url || body.error}`);
}
