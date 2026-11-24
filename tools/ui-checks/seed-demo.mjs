// Seeds a realistic demo café through the public API (so all validation applies).
const B = 'http://127.0.0.1:5000/api';
const hdr = (t) => ({ 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) });
async function call(method, path, body, token) {
  const r = await fetch(B + path, { method, headers: hdr(token), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${JSON.stringify(j)}`);
  return j;
}
await new Promise((r) => setTimeout(r, 2500));
const owner = (await call('POST', '/auth/login', { username: 'admin', password: 'admin123' })).token;

await call('PUT', '/organization', {
  legal_name: 'Sri Ganesh Foods', trade_name: 'Ganesh Bhavan', address_line1: '12, Gandhi Road', city: 'Chennai',
  state_code: '33', pincode: '600017', phone: '9876543210', business_types: ['FOOD']
}, owner);

const menu = {
  Beverages: [['Filter Coffee', 30], ['Masala Chai', 25], ['Fresh Lime Soda', 45], ['Badam Milk', 50]],
  Breakfast: [['Idli (2 pcs)', 40], ['Masala Dosa', 80], ['Ven Pongal', 70], ['Medu Vada', 35]],
  Snacks: [['Samosa', 20], ['Bajji Plate', 45], ['Veg Puff', 30]],
  Meals: [['South Indian Thali', 160], ['Curd Rice', 75], ['Veg Biryani', 140]],
  Desserts: [['Gulab Jamun (2 pcs)', 50], ['Kesari', 45]]
};
const items = {};
for (const [cat, list] of Object.entries(menu)) {
  const c = (await call('POST', '/categories', { name: cat }, owner)).category;
  for (const [name, price] of list) {
    items[name] = (await call('POST', '/items', { name, price, category_id: c.id }, owner)).id;
  }
}
await call('POST', '/items', { name: 'Party Order (custom)', price: 0, allow_price_change: true }, owner);

await call('POST', '/users', { username: 'priya', password: 'manager123', full_name: 'Priya Raman', role: 'MANAGER', phone: '9840012345' }, owner);
await call('POST', '/users', { username: 'ravi', password: 'cashier123', full_name: 'Ravi Kumar', role: 'CASHIER', pin: '1234' }, owner);
await call('POST', '/users', { username: 'meena', password: 'cashier123', full_name: 'Meena S', role: 'CASHIER' }, owner);
const ravi = (await call('POST', '/auth/login', { username: 'ravi', password: 'cashier123' })).token;
const priya = (await call('POST', '/auth/login', { username: 'priya', password: 'manager123' })).token;

const customers = [];
for (const [name, phone] of [['Arun Prakash', '9884011111'], ['Lakshmi Narayanan', '9884022222'], ['Fathima Begum', '9884033333'],
  ['John Mathew', '9884044444'], ['Karthik R', '9884055555'], ['Sneha Iyer', '9884066666']]) {
  customers.push((await call('POST', '/customers', { name, phone }, ravi)).customer.id);
}

const bills = [
  [ravi, [['Filter Coffee', 2], ['Idli (2 pcs)', 2]], 'CASH', 200, 0, 0],
  [ravi, [['Masala Dosa', 1], ['Filter Coffee', 1]], 'UPI', null, 0, 1],
  [ravi, [['South Indian Thali', 2], ['Fresh Lime Soda', 2]], 'CARD', null, 20, 2],
  [priya, [['Veg Biryani', 3], ['Gulab Jamun (2 pcs)', 3]], 'UPI', null, 50, null],
  [ravi, [['Samosa', 4], ['Masala Chai', 4]], 'CASH', 200, 0, null],
  [ravi, [['Ven Pongal', 1], ['Medu Vada', 2], ['Filter Coffee', 1]], 'CASH', 200, 0, 3],
  [ravi, [['Curd Rice', 2], ['Badam Milk', 1]], 'UPI', null, 0, null],
  [priya, [['Bajji Plate', 2], ['Veg Puff', 2], ['Masala Chai', 2]], 'CASH', 500, 10, 4],
  [ravi, [['Kesari', 2], ['Filter Coffee', 2]], 'UPI', null, 0, 5],
  [ravi, [['Masala Dosa', 2], ['Idli (2 pcs)', 1], ['Badam Milk', 2]], 'CARD', null, 0, 0],
  [ravi, [['South Indian Thali', 1]], 'CASH', 200, 0, null],
  [ravi, [['Filter Coffee', 3]], 'UPI', null, 0, null]
];
const ids = [];
for (const [token, lines, payment_method, cash, discount, custIdx] of bills) {
  const body = {
    items: lines.map(([n, q]) => ({ item_id: items[n], quantity: q })),
    payment_method,
    discount,
    ...(cash ? { cash_received: cash } : {}),
    ...(custIdx !== null && custIdx !== undefined ? { customer_id: customers[custIdx] } : {})
  };
  ids.push((await call('POST', '/orders', body, token)).order.id);
}
await call('PATCH', `/orders/${ids[4]}/status`, { status: 'VOID', reason: 'Customer cancelled the order' }, owner);
console.log(`seeded: ${Object.keys(items).length + 1} items, ${customers.length} customers, ${ids.length} bills (1 void), 3 staff`);
