const express = require('express');
const { all, get } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

// GET /api/reports/eod - Date-Range Sales Reporting
router.get('/eod', async (req, res) => {
  try {
    const { date, startDate, endDate, from_date, to_date } = req.query;

    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const start = startDate || from_date || date || todayStr;
    const end = endDate || to_date || date || start;

    const summary = await get(
      `SELECT 
        COUNT(CASE WHEN payment_status = 'PAID' THEN 1 END) as paid_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN final_amount ELSE 0 END), 0), 2) as total_revenue,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN discount ELSE 0 END), 0), 2) as total_discounts,
        COUNT(CASE WHEN payment_status = 'VOID' THEN 1 END) as void_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'VOID' THEN final_amount ELSE 0 END), 0), 2) as void_revenue,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NOT NULL THEN 1 END) as customer_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND customer_id IS NOT NULL THEN final_amount ELSE 0 END), 0), 2) as customer_revenue,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NULL THEN 1 END) as guest_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND customer_id IS NULL THEN final_amount ELSE 0 END), 0), 2) as guest_revenue
       FROM orders
       WHERE date(created_at, '+5 hours', '+30 minutes') BETWEEN date(?) AND date(?)`,
      [start, end]
    );

    const paymentBreakdown = await all(
      `SELECT payment_method, COUNT(*) as count, ROUND(COALESCE(SUM(final_amount), 0), 2) as amount
       FROM orders
       WHERE payment_status = 'PAID' AND date(created_at, '+5 hours', '+30 minutes') BETWEEN date(?) AND date(?)
       GROUP BY payment_method`,
      [start, end]
    );

    const topItems = await all(
      `SELECT oi.item_name, SUM(oi.quantity) as total_qty, ROUND(SUM(oi.subtotal), 2) as total_sales
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.payment_status = 'PAID' AND date(o.created_at, '+5 hours', '+30 minutes') BETWEEN date(?) AND date(?)
       GROUP BY oi.item_name
       ORDER BY total_qty DESC
       LIMIT 10`,
      [start, end]
    );

    const dailyBreakdown = await all(
      `SELECT 
        date(created_at, '+5 hours', '+30 minutes') as date,
        COUNT(CASE WHEN payment_status = 'PAID' THEN 1 END) as paid_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN final_amount ELSE 0 END), 0), 2) as total_revenue,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN discount ELSE 0 END), 0), 2) as total_discounts,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NOT NULL THEN 1 END) as customer_orders,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NULL THEN 1 END) as guest_orders
       FROM orders
       WHERE date(created_at, '+5 hours', '+30 minutes') BETWEEN date(?) AND date(?)
       GROUP BY date
       ORDER BY date DESC`,
      [start, end]
    );

    return res.json({
      startDate: start,
      endDate: end,
      date: start === end ? start : `${start} to ${end}`,
      summary: summary || {
        paid_orders_count: 0,
        total_revenue: 0,
        total_discounts: 0,
        void_orders_count: 0,
        void_revenue: 0,
        customer_orders_count: 0,
        customer_revenue: 0,
        guest_orders_count: 0,
        guest_revenue: 0
      },
      paymentBreakdown,
      topItems,
      dailyBreakdown
    });
  } catch (err) {
    console.error('Fetch EOD Report Error:', err);
    return res.status(500).json({ error: 'Failed to generate EOD report' });
  }
});

module.exports = router;
