// A failing async route must answer 500 and leave the server running (Express 4 alone would crash).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { installAsyncErrorHandling } = require('../src/utils/asyncRoutes');

test('rejected async handlers reach the error handler instead of crashing the process', async () => {
  installAsyncErrorHandling();
  const app = express();
  const router = express.Router();
  router.get('/boom', async () => { throw new Error('database exploded'); });
  router.post('/chain', (req, res, next) => next(), async () => { await Promise.resolve(); throw new Error('late'); });
  router.get('/ok', async (req, res) => res.json({ ok: true }));
  app.use(router);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

  let unhandled = null;
  const onUnhandled = (e) => { unhandled = e; };
  process.on('unhandledRejection', onUnhandled);

  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const a = await fetch(`${base}/boom`);
    assert.equal(a.status, 500);
    assert.equal((await a.json()).error, 'database exploded');
    const b = await fetch(`${base}/chain`, { method: 'POST' });
    assert.equal(b.status, 500);
    const c = await fetch(`${base}/ok`);
    assert.equal(c.status, 200, 'server still serving');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(unhandled, null, 'no unhandled promise rejection');
  } finally {
    process.off('unhandledRejection', onUnhandled);
    server.close();
  }
});
