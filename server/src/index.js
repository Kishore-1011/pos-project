require('dotenv').config();

const { seedDatabase } = require('./db/seed');
const { createApp } = require('./app');
const { PRODUCT_NAME } = require('./config/brand');

// Loopback only by default. Set HOST explicitly (e.g. for a future LAN mode) to change it.
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT !== undefined ? Number(process.env.PORT) : 5000;
// Desktop app sets this so a busy port 5000 falls back to any free port instead of crashing.
const ALLOW_PORT_FALLBACK = process.env.POS_PORT_FALLBACK === 'true';

function listen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

// Initialize database & seed, then listen. Resolves with { server, port, url }.
async function startServer() {
  console.log('[Server] Seeding & verifying database...');
  await seedDatabase();
  const app = createApp();

  let server;
  try {
    server = await listen(app, PORT);
  } catch (err) {
    if (err.code === 'EADDRINUSE' && ALLOW_PORT_FALLBACK) {
      console.warn(`[Server] Port ${PORT} is busy, using a free port instead.`);
      server = await listen(app, 0);
    } else {
      throw err;
    }
  }

  const port = server.address().port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`=================================================`);
  console.log(`${PRODUCT_NAME} server running on ${url}`);
  console.log(`=================================================`);
  return { server, port, url };
}

const ready = startServer();
ready.catch((err) => {
  console.error('[Server Startup Fatal Error]:', err);
  if (require.main === module) process.exit(1);
});

module.exports = { ready };
