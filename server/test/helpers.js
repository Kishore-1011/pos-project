// Test harness: isolated temp DB + uploads per test file, app on a random loopback port.
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-test-'));
process.env.POS_DB_PATH = path.join(tmp, 'data', 'test.db');
process.env.POS_UPLOADS_PATH = path.join(tmp, 'uploads', 'items');
delete process.env.JWT_SECRET;
delete process.env.POS_USER_DATA_PATH;

const { seedDatabase } = require('../src/db/seed');
const { createApp } = require('../src/app');

async function startTestServer() {
  await seedDatabase();
  const app = createApp({ logRequests: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, urlPath, { body, token, headers = {} } = {}) {
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    const res = await fetch(base + urlPath, {
      method,
      headers: {
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined
    });
    let json = null;
    try { json = await res.json(); } catch (e) { /* non-JSON */ }
    return { status: res.status, body: json, headers: res.headers };
  }

  async function login(username, password) {
    const r = await call('POST', '/api/auth/login', { body: { username, password } });
    if (r.status !== 200) throw new Error(`login ${username} failed: ${r.status} ${JSON.stringify(r.body)}`);
    return r.body.token;
  }

  function close() {
    return new Promise((resolve) => server.close(resolve));
  }

  return { base, call, login, close, tmp };
}

module.exports = { startTestServer, tmp };
