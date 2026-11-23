const express = require('express');
const { all, get, run } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { orderColumns } = require('../db/columns');

const router = express.Router();

router.use(authenticateToken);

// Helper to generate sequential Customer Code: CUST-XXXX
async function generateCustomerCode() {
  const lastCust = await get("SELECT id FROM customers ORDER BY id DESC LIMIT 1");
  const countRow = await get("SELECT COUNT(*) as count FROM customers");
  const nextSeq = Math.max(lastCust ? lastCust.id + 1 : 1, (countRow ? countRow.count : 0) + 1);
  return `CUST-${String(nextSeq).padStart(4, '0')}`;
}

// GET /api/customers - Search / Autocomplete & Reporting List
router.get('/', async (req, res) => {
  try {
    const { search, limit = 50, sortBy = 'spend', order = 'DESC', withStats = 'true' } = req.query;
    const cleanSearch = (search || '').trim();

    if (withStats === 'true' || req.headers['x-view'] === 'crm') {
      let sql = `
        SELECT 
          c.id, 
          c.customer_code, 
          c.name, 
          c.phone, 
          COALESCE(c.is_active, 1) as is_active,
          c.created_at,
          COUNT(CASE WHEN o.payment_status = 'PAID' THEN o.id END) as total_orders,
          ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.final_amount_paise ELSE 0 END), 0) / 100.0, 2) as total_spend,
          MAX(CASE WHEN o.payment_status = 'PAID' THEN o.created_at END) as last_visit
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
      `;

      const conditions = [];
      const params = [];

      if (cleanSearch) {
        conditions.push('(c.name LIKE ? OR c.phone LIKE ? OR c.customer_code LIKE ?)');
        const term = `%${cleanSearch}%`;
        params.push(term, term, term);
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' GROUP BY c.id';

      // Sort ordering
      if (sortBy === 'orders') {
        sql += ` ORDER BY total_orders ${order === 'ASC' ? 'ASC' : 'DESC'}, c.name ASC`;
      } else if (sortBy === 'recent') {
        sql += ` ORDER BY last_visit ${order === 'ASC' ? 'ASC' : 'DESC'}, c.id DESC`;
      } else if (sortBy === 'name') {
        sql += ` ORDER BY c.name ${order === 'DESC' ? 'DESC' : 'ASC'}`;
      } else if (sortBy === 'code') {
        sql += ` ORDER BY c.id ${order === 'ASC' ? 'ASC' : 'DESC'}`;
      } else {
        // default: spend
        sql += ` ORDER BY total_spend ${order === 'ASC' ? 'ASC' : 'DESC'}, total_orders DESC`;
      }

      sql += ` LIMIT ?`;
      params.push(parseInt(limit, 10) || 50);

      const customers = await all(sql, params);

      // Aggregate global CRM metrics
      const summaryStats = await get(`
        SELECT 
          COUNT(DISTINCT c.id) as total_customers,
          ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.final_amount_paise ELSE 0 END), 0) / 100.0, 2) as total_customer_revenue,
          COUNT(CASE WHEN o.payment_status = 'PAID' THEN o.id END) as total_customer_orders
        FROM customers c
        LEFT JOIN orders o ON c.id = o.customer_id
      `);

      return res.json({
        customers,
        stats: {
          total_customers: summaryStats?.total_customers || 0,
          total_customer_revenue: summaryStats?.total_customer_revenue || 0,
          total_customer_orders: summaryStats?.total_customer_orders || 0,
          avg_spend: summaryStats?.total_customers > 0 
            ? ((summaryStats.total_customer_revenue || 0) / summaryStats.total_customers) 
            : 0
        }
      });
    }

    // Basic Search for billing autocomplete
    let sql = `SELECT id, customer_code, name, phone, COALESCE(is_active, 1) as is_active, created_at FROM customers`;
    const conditions = [];
    const params = [];

    // Filter active only for autocomplete
    if (req.query.activeOnly === 'true' || req.query.activeOnly === true) {
      conditions.push('COALESCE(is_active, 1) = 1');
    }

    if (cleanSearch) {
      conditions.push('(phone LIKE ? OR name LIKE ? OR customer_code LIKE ?)');
      const term = `%${cleanSearch}%`;
      params.push(term, term, term);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ` ORDER BY name ASC LIMIT ?`;
    params.push(parseInt(limit, 10) || 10);

    const customers = await all(sql, params);
    return res.json({ customers });
  } catch (err) {
    console.error('Fetch Customers Error:', err);
    return res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// GET /api/customers/:id - Single customer with past order history
router.get('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const customer = await get(
      `SELECT 
        c.id, 
        c.customer_code, 
        c.name, 
        c.phone, 
        c.created_at,
        COUNT(CASE WHEN o.payment_status = 'PAID' THEN o.id END) as total_orders,
        ROUND(COALESCE(SUM(CASE WHEN o.payment_status = 'PAID' THEN o.final_amount_paise ELSE 0 END), 0) / 100.0, 2) as total_spend,
        MAX(CASE WHEN o.payment_status = 'PAID' THEN o.created_at END) as last_visit
       FROM customers c
       LEFT JOIN orders o ON c.id = o.customer_id
       WHERE c.id = ?
       GROUP BY c.id`,
      [customerId]
    );

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const orders = await all(
      `SELECT ${orderColumns('o')},
              u.full_name as cashier_name,
              (SELECT GROUP_CONCAT(oi.item_name || ' (x' || oi.quantity || ')', ', ') FROM order_items oi WHERE oi.order_id = o.id) as items_summary,
              (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) as total_items_count
       FROM orders o
       JOIN users u ON o.user_id = u.id
       WHERE o.customer_id = ?
       ORDER BY o.id DESC`,
      [customerId]
    );

    return res.json({ customer, orders });
  } catch (err) {
    console.error('Get Customer Detail Error:', err);
    return res.status(500).json({ error: 'Failed to fetch customer details' });
  }
});

// POST /api/customers - Register New Customer (Auto generates CUST-XXXX)
router.post('/', async (req, res) => {
  try {
    const { name, phone } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }

    const cleanPhone = phone.trim();
    const cleanName = name.trim();

    // Check if phone already registered
    const existing = await get("SELECT * FROM customers WHERE phone = ?", [cleanPhone]);
    if (existing) {
      return res.status(200).json({
        customer: existing,
        existing: true,
        message: 'Customer with this phone number already registered'
      });
    }

    const customerCode = await generateCustomerCode();

    const insertRes = await run(
      `INSERT INTO customers (customer_code, name, phone, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
      [customerCode, cleanName, cleanPhone]
    );

    const newCustomer = await get("SELECT * FROM customers WHERE id = ?", [insertRes.lastInsertRowid]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CUSTOMER_CREATE',
      entityType: 'customer',
      entityId: newCustomer.id,
      newValue: { customer_code: newCustomer.customer_code, name: newCustomer.name, phone: newCustomer.phone }
    });

    return res.status(201).json({ customer: newCustomer, existing: false });
  } catch (err) {
    console.error('Create Customer Error:', err);
    return res.status(500).json({ error: 'Failed to create customer' });
  }
});

// PUT /api/customers/:id - Update Customer Details
router.put('/:id', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const { name, phone } = req.body;

    const oldCustomer = await get("SELECT * FROM customers WHERE id = ?", [customerId]);
    if (!oldCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const newName = name ? name.trim() : oldCustomer.name;
    const newPhone = phone ? phone.trim() : oldCustomer.phone;

    // Check if phone conflicts with another customer
    if (newPhone !== oldCustomer.phone) {
      const phoneConflict = await get("SELECT id FROM customers WHERE phone = ? AND id != ?", [newPhone, customerId]);
      if (phoneConflict) {
        return res.status(400).json({ error: 'Another customer is already registered with this phone number' });
      }
    }

    await run(
      `UPDATE customers SET name = ?, phone = ? WHERE id = ?`,
      [newName, newPhone, customerId]
    );

    const updatedCustomer = await get("SELECT * FROM customers WHERE id = ?", [customerId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CUSTOMER_UPDATE',
      entityType: 'customer',
      entityId: customerId,
      oldValue: { name: oldCustomer.name, phone: oldCustomer.phone },
      newValue: { name: updatedCustomer.name, phone: updatedCustomer.phone }
    });

    return res.json({ customer: updatedCustomer });
  } catch (err) {
    console.error('Update Customer Error:', err);
    return res.status(500).json({ error: 'Failed to update customer' });
  }
});

// PATCH /api/customers/:id/status - Toggle active/disabled status
router.patch('/:id/status', async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const { is_active } = req.body;

    const customer = await get("SELECT * FROM customers WHERE id = ?", [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const newStatus = is_active === 0 || is_active === false ? 0 : 1;
    await run("UPDATE customers SET is_active = ? WHERE id = ?", [newStatus, customerId]);

    const updated = await get("SELECT * FROM customers WHERE id = ?", [customerId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CUSTOMER_TOGGLE_STATUS',
      entityType: 'customer',
      entityId: customerId,
      oldValue: { is_active: customer.is_active },
      newValue: { is_active: updated.is_active }
    });

    return res.json({ customer: updated });
  } catch (err) {
    console.error('Toggle Customer Status Error:', err);
    return res.status(500).json({ error: 'Failed to update customer status' });
  }
});

// DELETE /api/customers/:id - Admin Only
router.delete('/:id', requireRole('ADMIN'), async (req, res) => {
  try {
    const customerId = parseInt(req.params.id, 10);
    const customer = await get("SELECT * FROM customers WHERE id = ?", [customerId]);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Detach orders to avoid orphan integrity issues or preserve history
    await run("UPDATE orders SET customer_id = NULL WHERE customer_id = ?", [customerId]);
    await run("DELETE FROM customers WHERE id = ?", [customerId]);

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'CUSTOMER_DELETE',
      entityType: 'customer',
      entityId: customerId,
      oldValue: { customer_code: customer.customer_code, name: customer.name, phone: customer.phone }
    });

    return res.json({ success: true, message: 'Customer profile removed successfully' });
  } catch (err) {
    console.error('Delete Customer Error:', err);
    return res.status(500).json({ error: 'Failed to delete customer' });
  }
});

module.exports = router;
