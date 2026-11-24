const express = require('express');
const path = require('path');
const fs = require('fs');

// Must run before any route file is loaded (routes are registered when their modules load)
require('./utils/asyncRoutes').installAsyncErrorHandling();

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const itemRoutes = require('./routes/itemRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const organizationRoutes = require('./routes/organizationRoutes');
const numberSeriesRoutes = require('./routes/numberSeriesRoutes');
const roleRoutes = require('./routes/roleRoutes');
const setupRoutes = require('./routes/setupRoutes');
const { PRODUCT_NAME } = require('./config/brand');
const { getUploadsDirectory } = require('./config/paths');

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostnameOf(value) {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch (e) {
    return null;
  }
}

/**
 * The API is for this computer only:
 * - Host header must be a loopback name (blocks DNS-rebinding from websites).
 * - If the browser sends an Origin, it must be a loopback origin (the desktop app, which is
 *   served by this server, or the Vite dev server). Other websites, file:// and "null" are refused.
 */
function localOnly(req, res, next) {
  const host = hostnameOf(req.headers.host || '');
  if (!host || !LOCAL_HOSTNAMES.has(host)) {
    return res.status(403).json({ error: 'Forbidden host' });
  }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    const originHost = origin.startsWith('http://') ? hostnameOf(origin) : null;
    if (!originHost || !LOCAL_HOSTNAMES.has(originHost)) {
      return res.status(403).json({ error: 'Forbidden origin' });
    }
  }
  next();
}

function createApp({ logRequests = true } = {}) {
  const app = express();
  app.disable('x-powered-by');

  const uploadsDir = getUploadsDirectory();
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  app.use(localOnly);
  app.use(express.json({ limit: '1mb' }));

  if (logRequests) {
    app.use((req, res, next) => {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
      next();
    });
  }

  // Item images are stored as /uploads/items/<file>, so serve the parent of the items folder.
  // nosniff stops a browser from treating an uploaded file as anything but its declared type.
  app.use('/uploads', express.static(path.dirname(uploadsDir), {
    setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
  }));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/items', itemRoutes);
  app.use('/api/categories', categoryRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/audit-logs', auditRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/organization', organizationRoutes);
  app.use('/api/number-series', numberSeriesRoutes);
  app.use('/api/roles', roleRoutes);
  app.use('/api/setup', setupRoutes);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: `${PRODUCT_NAME} server operational`, timestamp: new Date().toISOString() });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Desktop app: serve the built UI from the same origin as the API.
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(path.join(clientDist, 'index.html'))) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api\/|uploads\/).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // Error handler (upload rejections, bad JSON, etc.)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err && err.name === 'MulterError') {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message;
      return res.status(400).json({ error: msg });
    }
    const status = err && (err.status || err.statusCode);
    if (status && status >= 400 && status < 500) {
      return res.status(status).json({ error: err.expose === false ? 'Bad request' : err.message });
    }
    console.error('Unhandled Error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp, localOnly };
