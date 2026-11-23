const express = require('express');
const { all, get, run } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { logAudit } = require('../services/auditService');
const { INVOICE_PREFIX } = require('../config/brand');

const router = express.Router();

router.use(authenticateToken);

// Helper function to generate compact Invoice Number: INV-XXXX
async function generateInvoiceNumber() {
  const lastOrder = await get("SELECT id FROM orders ORDER BY id DESC LIMIT 1");
  const countRow = await get("SELECT COUNT(*) as count FROM orders");
  const nextSeq = Math.max(lastOrder ? lastOrder.id + 1 : 1, (countRow ? countRow.count : 0) + 1);
  const seqPadded = String(nextSeq).padStart(4, '0');
  return `${INVOICE_PREFIX}${seqPadded}`;
}

// POST /api/orders - Create New Bill
router.post('/', async (req, res) => {
  try {
    const { items, discount = 0, payment_method = 'CASH', cash_received = 0, notes = '', metadata = null, customer_id = null } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }

    if (!['CASH', 'UPI', 'CARD'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }

    const cleanCustomerId = customer_id ? parseInt(customer_id, 10) : null;
    let customerInfo = null;
    if (cleanCustomerId) {
      customerInfo = await get("SELECT id, customer_code, name, phone FROM customers WHERE id = ?", [cleanCustomerId]);
    }

    // Process line items and compute subtotal
    let subtotal = 0;
    const lineItemsToInsert = [];

    for (const line of items) {
      const dbItem = await get("SELECT id, name, price, is_active FROM items WHERE id = ?", [line.item_id]);
      if (!dbItem) {
        return res.status(400).json({ error: `Item ID ${line.item_id} not found` });
      }
      const qty = parseInt(line.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({ error: `Invalid quantity for item ${dbItem.name}` });
      }

      const itemSubtotal = dbItem.price * qty;
      subtotal += itemSubtotal;

      lineItemsToInsert.push({
        item_id: dbItem.id,
        item_name: dbItem.name,
        unit_price: dbItem.price,
        quantity: qty,
        subtotal: itemSubtotal
      });
    }

    const discountAmount = Math.max(0, parseFloat(discount) || 0);
    const finalAmount = Math.max(0, subtotal - discountAmount);

    let changeGiven = 0;
    if (payment_method === 'CASH') {
      const received = parseFloat(cash_received) || 0;
      changeGiven = Math.max(0, received - finalAmount);
    }

    const invoiceNo = await generateInvoiceNumber();
    const metadataStr = metadata ? JSON.stringify(metadata) : null;

    const nowIso = new Date().toISOString();

    // Run INSERT for the order with explicit ISO timestamp and customer_id
    await run(
      `INSERT INTO orders 
       (order_number, invoice_no, user_id, customer_id, subtotal, discount, final_amount, payment_method, payment_status, cash_received, change_given, notes, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        invoiceNo,
        req.user.id,
        cleanCustomerId,
        subtotal,
        discountAmount,
        finalAmount,
        payment_method,
        parseFloat(cash_received) || 0,
        changeGiven,
        notes.trim(),
        metadataStr,
        nowIso,
        nowIso
      ]
    );

    // Fetch the newly created order directly with customer and cashier details
    const createdOrder = await get(
      `SELECT o.*, u.full_name as cashier_name, u.username as cashier_username,
              c.customer_code, c.name as customer_name, c.phone as customer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.order_number = ? OR o.invoice_no = ?`,
      [invoiceNo, invoiceNo]
    );
    const orderId = createdOrder ? createdOrder.id : null;

    if (!orderId) {
      throw new Error('Failed to retrieve newly created order record');
    }

    for (const item of lineItemsToInsert) {
      await run(
        `INSERT INTO order_items (order_id, item_id, item_name, unit_price, quantity, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, item.item_id, item.item_name, item.unit_price, item.quantity, item.subtotal]
      );
    }

    const insertedLineItems = await all("SELECT * FROM order_items WHERE order_id = ?", [orderId]);

    // Audit Log with the real primary key ID and Customer Info
    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: 'ORDER_CREATE',
      entityType: 'order',
      entityId: orderId,
      newValue: {
        order_id: orderId,
        order_number: invoiceNo,
        invoice_no: invoiceNo,
        total: finalAmount,
        final_amount: finalAmount,
        payment_method: payment_method,
        customer_id: cleanCustomerId,
        customer_name: customerInfo?.name || 'Walk-in / Guest',
        items_count: lineItemsToInsert.length
      }
    });

    return res.status(201).json({
      order: {
        ...createdOrder,
        order_number: invoiceNo,
        invoice_no: invoiceNo,
        customer_name: customerInfo?.name || createdOrder?.customer_name,
        customer_phone: customerInfo?.phone || createdOrder?.customer_phone,
        customer_code: customerInfo?.customer_code || createdOrder?.customer_code
      },
      items: insertedLineItems,
      invoice_no: invoiceNo,
      order_number: invoiceNo
    });
  } catch (err) {
    console.error('Create Order Error:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
});

// GET /api/orders - Filter, search, and paginate past orders
router.get('/', async (req, res) => {
  try {
    const { 
      status, 
      payment_status,
      payment_method, 
      customer_id, 
      user_id,
      staff_id,
      staff_name,
      startDate, 
      endDate, 
      from_date,
      to_date,
      search,
      page = 1,
      limit = 25,
      rawArray = 'false'
    } = req.query;

    const start = startDate || from_date;
    const end = endDate || to_date;
    const cleanStatus = status || payment_status;

    let baseConditions = [];
    let params = [];

    if (cleanStatus && cleanStatus !== 'ALL') {
      baseConditions.push('o.payment_status = ?');
      params.push(cleanStatus);
    }
    if (payment_method && payment_method !== 'ALL') {
      if (payment_method === 'UPI_CARD' || payment_method === 'DIGITAL' || payment_method === 'UPI/CARD' || payment_method === 'UPI / CARD') {
        baseConditions.push(`o.payment_method IN ('UPI', 'CARD', 'UPI/CARD', 'UPI / CARD')`);
      } else {
        baseConditions.push('o.payment_method = ?');
        params.push(payment_method);
      }
    }
    if (customer_id) {
      baseConditions.push('o.customer_id = ?');
      params.push(parseInt(customer_id, 10));
    }
    const staffFilterId = user_id || staff_id;
    if (staffFilterId && staffFilterId !== 'ALL') {
      baseConditions.push('o.user_id = ?');
      params.push(parseInt(staffFilterId, 10));
    } else if (staff_name && staff_name !== 'ALL') {
      baseConditions.push('(u.full_name = ? OR u.username = ?)');
      params.push(staff_name, staff_name);
    }
    if (start && end) {
      baseConditions.push(`date(o.created_at, '+5 hours', '+30 minutes') BETWEEN date(?) AND date(?)`);
      params.push(start, end);
    } else if (start) {
      baseConditions.push(`date(o.created_at, '+5 hours', '+30 minutes') >= date(?)`);
      params.push(start);
    } else if (end) {
      baseConditions.push(`date(o.created_at, '+5 hours', '+30 minutes') <= date(?)`);
      params.push(end);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      baseConditions.push(`(
        o.invoice_no LIKE ? OR 
        o.order_number LIKE ? OR 
        c.name LIKE ? OR 
        c.phone LIKE ? OR 
        c.customer_code LIKE ? OR
        u.full_name LIKE ? OR
        u.username LIKE ?
      )`);
      params.push(term, term, term, term, term, term, term);
    }

    const whereClause = baseConditions.length > 0 ? ' WHERE ' + baseConditions.join(' AND ') : '';

    // 1. Total count query
    const countSql = `
      SELECT COUNT(*) as count 
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
    `;
    const countResult = await get(countSql, params);
    const total = countResult?.count || 0;

    // 2. Data query with pagination & item summaries
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 25);
    const offset = (pageNum - 1) * limitNum;

    const dataSql = `
      SELECT o.*, 
             u.full_name as staff_name,
             u.full_name as cashier_name, 
             u.username as cashier_username,
             u.full_name as created_by,
             c.customer_code, 
             c.name as customer_name, 
             c.phone as customer_phone,
             (SELECT GROUP_CONCAT(oi.item_name || ' (x' || oi.quantity || ')', ', ') FROM order_items oi WHERE oi.order_id = o.id) as items_summary,
             (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) as total_items_count
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN customers c ON o.customer_id = c.id
      ${whereClause}
      ORDER BY o.id DESC
      LIMIT ? OFFSET ?
    `;

    const dataParams = [...params, limitNum, offset];
    const orders = await all(dataSql, dataParams);

    if (rawArray === 'true') {
      return res.json(orders);
    }

    return res.json({
      orders,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    });
  } catch (err) {
    console.error('Fetch Orders Error:', err);
    return res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// GET /api/orders/:id - Single order detail with items
router.get('/:id', async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = await get(
      `SELECT o.*, u.full_name as cashier_name, u.username as cashier_username,
              c.customer_code, c.name as customer_name, c.phone as customer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [orderId]
    );

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = await all("SELECT * FROM order_items WHERE order_id = ?", [orderId]);
    return res.json({ order, items });
  } catch (err) {
    console.error('Get Order Detail Error:', err);
    return res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// PATCH /api/orders/:id/status - Admin Only (Void order / update status)
router.patch('/:id/status', requireRole('ADMIN'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status, notes } = req.body;

    if (!['PAID', 'PENDING', 'VOID'].includes(status)) {
      return res.status(400).json({ error: 'Invalid order status. Allowed: PAID, PENDING, VOID' });
    }

    const oldOrder = await get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!oldOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const newNotes = notes !== undefined ? notes.trim() : oldOrder.notes;

    await run(
      `UPDATE orders SET payment_status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, newNotes, orderId]
    );

    const updatedOrder = await get("SELECT * FROM orders WHERE id = ?", [orderId]);

    const actionType = status === 'VOID' ? 'VOID_ORDER' : 'STATUS_CHANGE';

    await logAudit({
      userId: req.user.id,
      userName: req.user.username,
      action: actionType,
      entityType: 'order',
      entityId: orderId,
      oldValue: { payment_status: oldOrder.payment_status, notes: oldOrder.notes },
      newValue: { payment_status: updatedOrder.payment_status, notes: updatedOrder.notes }
    });

    return res.json(updatedOrder);
  } catch (err) {
    console.error('Update Order Status Error:', err);
    return res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;
