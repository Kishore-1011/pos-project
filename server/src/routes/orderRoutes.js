const express = require('express');
const { all, get, runSync, transaction } = require('../db/database');
const numberSeries = require('../services/numberSeriesService');
const calendar = require('../services/calendar');
const { orderColumns, orderItemColumns } = require('../db/columns');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const { logAuditSync } = require('../services/auditService');
const { toPaise, fromPaise } = require('../utils/money');

const MAX_ORDER_LINES = 200;
const MAX_LINE_QUANTITY = 10000;
const MAX_UNIT_PRICE_PAISE = 10000000 * 100; // ₹1 crore, same cap as catalog prices

const router = express.Router();

router.use(authenticateToken);


// POST /api/orders - Create New Bill
router.post('/', requirePermission('billing.create'), async (req, res) => {
  try {
    const { items, discount = 0, payment_method = 'CASH', cash_received = 0, notes = '', metadata = null, customer_id = null } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Order must contain at least one item' });
    }
    if (items.length > MAX_ORDER_LINES) {
      return res.status(400).json({ error: `An order can have at most ${MAX_ORDER_LINES} lines` });
    }

    if (!['CASH', 'UPI', 'CARD'].includes(payment_method)) {
      return res.status(400).json({ error: 'Invalid payment method. Allowed: CASH, UPI, CARD' });
    }

    if (notes !== null && notes !== undefined && typeof notes !== 'string') {
      return res.status(400).json({ error: 'Notes must be text' });
    }
    const cleanNotes = (notes || '').trim().slice(0, 500);

    let cleanCustomerId = null;
    let customerInfo = null;
    if (customer_id !== null && customer_id !== undefined && customer_id !== '') {
      cleanCustomerId = parseInt(customer_id, 10);
      customerInfo = Number.isInteger(cleanCustomerId)
        ? await get("SELECT id, customer_code, name, phone FROM customers WHERE id = ?", [cleanCustomerId])
        : null;
      if (!customerInfo) {
        return res.status(400).json({ error: `Customer ${customer_id} not found` });
      }
    }

    // Process line items and compute subtotal (in paise). Prices always come from the DB.
    let subtotalPaise = 0;
    const lineItemsToInsert = [];
    const priceChanges = [];

    for (const line of items) {
      const itemId = Number(line && line.item_id);
      const dbItem = Number.isInteger(itemId)
        ? await get(
            `SELECT i.id, i.name, i.price_paise, i.is_active, i.allow_price_change, c.is_active AS category_active
             FROM items i LEFT JOIN categories c ON c.id = i.category_id
             WHERE i.id = ?`,
            [itemId]
          )
        : null;
      if (!dbItem) {
        return res.status(400).json({ error: `Item ID ${line && line.item_id} not found` });
      }
      if (dbItem.is_active !== 1 || dbItem.category_active === 0) {
        return res.status(400).json({ error: `Item "${dbItem.name}" is disabled and cannot be billed` });
      }

      const qty = Number(line.quantity);
      if (!Number.isInteger(qty) || qty <= 0 || qty > MAX_LINE_QUANTITY) {
        return res.status(400).json({
          error: `Invalid quantity for "${dbItem.name}": must be a whole number from 1 to ${MAX_LINE_QUANTITY}`
        });
      }

      // Price comes from the catalog unless the line asks for a different one (open-price items)
      const catalogPaise = dbItem.price_paise;
      let unitPaise = catalogPaise;
      let reason = null;
      if (line.unit_price !== undefined && line.unit_price !== null && line.unit_price !== '') {
        const requested = toPaise(line.unit_price);
        if (Number.isNaN(requested) || requested < 0 || requested > MAX_UNIT_PRICE_PAISE) {
          return res.status(400).json({ error: `Invalid price for "${dbItem.name}"` });
        }
        if (requested !== catalogPaise) {
          if (dbItem.allow_price_change !== 1) {
            return res.status(400).json({ error: `The price of "${dbItem.name}" can't be changed at billing` });
          }
          if (!req.can('billing.price_change')) {
            return res.status(403).json({ error: 'You do not have permission to change prices at billing', required: ['billing.price_change'] });
          }
          if (line.price_change_reason !== undefined && line.price_change_reason !== null && typeof line.price_change_reason !== 'string') {
            return res.status(400).json({ error: 'Price change reason must be text' });
          }
          unitPaise = requested;
          reason = (line.price_change_reason || '').trim().slice(0, 200) || null;
          priceChanges.push({ item_id: dbItem.id, item_name: dbItem.name, quantity: qty,
            catalog_price: fromPaise(catalogPaise), charged_price: fromPaise(requested), reason });
        }
      }
      const linePaise = unitPaise * qty;
      subtotalPaise += linePaise;

      lineItemsToInsert.push({
        item_id: dbItem.id,
        item_name: dbItem.name,
        unit_price_paise: unitPaise,
        catalog_unit_price_paise: catalogPaise,
        price_change_reason: reason,
        quantity: qty,
        subtotal_paise: linePaise
      });
    }

    const discountPaise = toPaise(discount === '' || discount === null ? 0 : discount);
    if (Number.isNaN(discountPaise) || discountPaise < 0) {
      return res.status(400).json({ error: 'Discount must be a non-negative amount' });
    }
    if (discountPaise > subtotalPaise) {
      return res.status(400).json({ error: 'Discount cannot be more than the bill subtotal' });
    }
    if (discountPaise > 0) {
      if (!req.can('billing.discount')) {
        return res.status(403).json({ error: 'You do not have permission to give discounts' });
      }
      // Role's discount limit (null = no limit, e.g. Owner)
      const maxPct = req.user.max_discount_pct;
      if (maxPct !== null && maxPct !== undefined) {
        const maxDiscountPaise = Math.floor((subtotalPaise * maxPct) / 100);
        if (discountPaise > maxDiscountPaise) {
          return res.status(403).json({
            error: `${req.user.role_name || 'Your role'} can give at most ${maxPct}% discount (₹${fromPaise(maxDiscountPaise).toFixed(2)} on this bill). Ask a manager.`
          });
        }
      }
    }

    const finalPaise = subtotalPaise - discountPaise;

    // Cash must cover the total; digital payments are recorded as exactly the total.
    let receivedPaise = finalPaise;
    let changePaise = 0;
    if (payment_method === 'CASH') {
      receivedPaise = toPaise(cash_received === '' || cash_received === null ? 0 : cash_received);
      if (Number.isNaN(receivedPaise) || receivedPaise < 0) {
        return res.status(400).json({ error: 'Cash received must be a non-negative amount' });
      }
      if (receivedPaise < finalPaise) {
        return res.status(400).json({
          error: `Cash received (₹${fromPaise(receivedPaise).toFixed(2)}) is less than the total (₹${fromPaise(finalPaise).toFixed(2)})`
        });
      }
      changePaise = receivedPaise - finalPaise;
    }

    const metadataStr = metadata ? JSON.stringify(metadata) : null;
    const now = new Date();
    const nowIso = now.toISOString();

    // Invoice number, order, lines and audit entry are saved all-or-nothing.
    const { orderId, invoiceNo } = transaction(() => {
      const newInvoiceNo = numberSeries.allocate('INVOICE', now);
      const { lastInsertRowid: newOrderId } = runSync(
        `INSERT INTO orders
         (order_number, invoice_no, user_id, customer_id, subtotal_paise, discount_paise, final_amount_paise,
          payment_method, payment_status, cash_received_paise, change_given_paise, notes, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?, ?, ?, ?)`,
        [newInvoiceNo, newInvoiceNo, req.user.id, cleanCustomerId, subtotalPaise, discountPaise, finalPaise,
         payment_method, receivedPaise, changePaise, cleanNotes, metadataStr, nowIso, nowIso]
      );

      for (const item of lineItemsToInsert) {
        runSync(
          `INSERT INTO order_items (order_id, item_id, item_name, unit_price_paise, catalog_unit_price_paise,
             price_change_reason, quantity, subtotal_paise)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [newOrderId, item.item_id, item.item_name, item.unit_price_paise, item.catalog_unit_price_paise,
           item.price_change_reason, item.quantity, item.subtotal_paise]
        );
      }

      // Price changes get their own audit entry so they can be filtered and reviewed
      if (priceChanges.length) {
        logAuditSync({
          userId: req.user.id,
          userName: req.user.username,
          action: 'BILL_PRICE_CHANGE',
          entityType: 'order',
          entityId: newOrderId,
          newValue: { invoice_no: newInvoiceNo, lines: priceChanges }
        });
      }

      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: 'ORDER_CREATE',
        entityType: 'order',
        entityId: newOrderId,
        newValue: {
          order_id: newOrderId,
          order_number: newInvoiceNo,
          invoice_no: newInvoiceNo,
          total: fromPaise(finalPaise),
          final_amount: fromPaise(finalPaise),
          payment_method: payment_method,
          customer_id: cleanCustomerId,
          customer_name: customerInfo?.name || 'Walk-in / Guest',
          items_count: lineItemsToInsert.length,
          price_changes: priceChanges.length
        }
      });

      return { orderId: newOrderId, invoiceNo: newInvoiceNo };
    });

    const createdOrder = await get(
      `SELECT ${orderColumns('o')}, u.full_name as cashier_name, u.username as cashier_username,
              c.customer_code, c.name as customer_name, c.phone as customer_phone
       FROM orders o
       JOIN users u ON o.user_id = u.id
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.id = ?`,
      [orderId]
    );
    const insertedLineItems = await all(`SELECT ${orderItemColumns('oi')} FROM order_items oi WHERE oi.order_id = ?`, [orderId]);

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
router.get('/', requirePermission('orders.view'), async (req, res) => {
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
    // Business-date filters (shop time zone + business-day cutoff) become exact UTC bounds
    if (start || end) {
      let range;
      try {
        range = calendar.businessRangeUtc(start, end);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }
      if (range.from) {
        baseConditions.push('o.created_at >= ?');
        params.push(range.from);
      }
      if (range.to) {
        baseConditions.push('o.created_at < ?');
        params.push(range.to);
      }
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
      SELECT ${orderColumns('o')},
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
router.get('/:id', requirePermission('orders.view'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const order = await get(
      `SELECT ${orderColumns('o')}, u.full_name as cashier_name, u.username as cashier_username,
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

    const items = await all(`SELECT ${orderItemColumns('oi')} FROM order_items oi WHERE oi.order_id = ?`, [orderId]);
    return res.json({ order, items });
  } catch (err) {
    console.error('Get Order Detail Error:', err);
    return res.status(500).json({ error: 'Failed to fetch order details' });
  }
});

// PATCH /api/orders/:id/status - Admin Only (Void order / update status)
// Voiding needs orders.void; restoring a voided bill needs orders.unvoid (checked below).
router.patch('/:id/status', requirePermission('orders.void', 'orders.unvoid'), async (req, res) => {
  try {
    const orderId = parseInt(req.params.id, 10);
    const { status } = req.body || {};
    // `notes` was used as the void reason by older clients; accept it as a fallback.
    const rawReason = req.body && (req.body.reason !== undefined ? req.body.reason : req.body.notes);
    const reason = typeof rawReason === 'string' ? rawReason.trim().slice(0, 500) : '';

    if (!['PAID', 'PENDING', 'VOID'].includes(status)) {
      return res.status(400).json({ error: 'Invalid order status. Allowed: PAID, PENDING, VOID' });
    }

    const oldOrder = await get("SELECT * FROM orders WHERE id = ?", [orderId]);
    if (!oldOrder) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (oldOrder.payment_status === status) {
      return res.status(400).json({ error: `Order is already ${status}` });
    }

    const isVoiding = status === 'VOID';
    const isUnvoiding = oldOrder.payment_status === 'VOID';
    const needed = isUnvoiding ? 'orders.unvoid' : 'orders.void';
    if (!req.can(needed)) {
      return res.status(403).json({ error: 'You do not have permission to do this', required: [needed] });
    }
    if ((isVoiding || isUnvoiding) && reason.length < 3) {
      return res.status(400).json({
        error: isVoiding ? 'A reason is required to void a bill' : 'A reason is required to restore a voided bill'
      });
    }

    const actionType = isVoiding ? 'VOID_ORDER' : (isUnvoiding ? 'UNVOID_ORDER' : 'STATUS_CHANGE');

    // Status change and its audit entry are saved together.
    transaction(() => {
      runSync(
        `UPDATE orders SET payment_status = ?, void_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [status, isVoiding ? reason : oldOrder.void_reason, orderId]
      );
      logAuditSync({
        userId: req.user.id,
        userName: req.user.username,
        action: actionType,
        entityType: 'order',
        entityId: orderId,
        oldValue: { payment_status: oldOrder.payment_status },
        newValue: { payment_status: status, reason: reason || null }
      });
    });

    const updatedOrder = await get(`SELECT ${orderColumns('o')} FROM orders o WHERE o.id = ?`, [orderId]);
    return res.json(updatedOrder);
  } catch (err) {
    console.error('Update Order Status Error:', err);
    return res.status(500).json({ error: 'Failed to update order status' });
  }
});

module.exports = router;
