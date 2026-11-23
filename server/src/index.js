const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { seedDatabase } = require('./db/seed');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const itemRoutes = require('./routes/itemRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const auditRoutes = require('./routes/auditRoutes');
const reportRoutes = require('./routes/reportRoutes');
const { PRODUCT_NAME } = require('./config/brand');
const { getUploadsDirectory } = require('./config/paths');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure local uploads directory exists (<root>/uploads/items)
const uploadsDir = getUploadsDirectory();
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());
app.use(express.json());

// Item images are stored as /uploads/items/<file>, so serve the parent of the items folder
app.use('/uploads', express.static(path.dirname(uploadsDir)));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/reports', reportRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: `${PRODUCT_NAME} server operational`, timestamp: new Date().toISOString() });
});

// Initialize database & seed before listening
async function startServer() {
  try {
    console.log('[Server] Seeding & verifying database...');
    await seedDatabase();
    app.listen(PORT, () => {
      console.log(`=================================================`);
      console.log(`${PRODUCT_NAME} server running on http://localhost:${PORT}`);
      console.log(`=================================================`);
    });
  } catch (err) {
    console.error('[Server Error]: Failed to start server:', err);
    throw err;
  }
}

startServer().catch((err) => {
  console.error('[Server Startup Fatal Error]:', err);
});
