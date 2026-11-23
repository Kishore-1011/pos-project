const express = require('express');
const { all, get } = require('../db/database');
const { authenticateToken, requireRole } = require('../middleware/auth');
const calendar = require('../services/calendar');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole('ADMIN'));

const rupees = (paise) => Math.round(paise) / 100;

// GET /api/reports/eod - sales for a range of business dates (shop time zone + business-day cutoff)
router.get('/eod', async (req, res) => {
  try {
    const { date, startDate, endDate, from_date, to_date } = req.query;

    const todayStr = calendar.businessDate();
    const start = startDate || from_date || date || todayStr;
    const end = endDate || to_date || date || start;
    let range;
    try {
      range = calendar.businessRangeUtc(start, end);
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
    if (range.from >= range.to) return res.status(400).json({ error: 'Start date must not be after end date' });

    // created_at is ISO UTC text (migration 006), so a plain range comparison works and uses the index
    const inRange = 'created_at >= ? AND created_at < ?';
    const params = [range.from, range.to];

    const summary = await get(
      `SELECT
        COUNT(CASE WHEN payment_status = 'PAID' THEN 1 END) as paid_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN final_amount_paise ELSE 0 END), 0) / 100.0, 2) as total_revenue,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' THEN discount_paise ELSE 0 END), 0) / 100.0, 2) as total_discounts,
        COUNT(CASE WHEN payment_status = 'VOID' THEN 1 END) as void_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'VOID' THEN final_amount_paise ELSE 0 END), 0) / 100.0, 2) as void_revenue,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NOT NULL THEN 1 END) as customer_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND customer_id IS NOT NULL THEN final_amount_paise ELSE 0 END), 0) / 100.0, 2) as customer_revenue,
        COUNT(CASE WHEN payment_status = 'PAID' AND customer_id IS NULL THEN 1 END) as guest_orders_count,
        ROUND(COALESCE(SUM(CASE WHEN payment_status = 'PAID' AND customer_id IS NULL THEN final_amount_paise ELSE 0 END), 0) / 100.0, 2) as guest_revenue
       FROM orders
       WHERE ${inRange}`,
      params
    );

    const paymentBreakdown = await all(
      `SELECT payment_method, COUNT(*) as count, ROUND(COALESCE(SUM(final_amount_paise), 0) / 100.0, 2) as amount
       FROM orders
       WHERE payment_status = 'PAID' AND ${inRange}
       GROUP BY payment_method`,
      params
    );

    const topItems = await all(
      `SELECT oi.item_name, SUM(oi.quantity) as total_qty, ROUND(SUM(oi.subtotal_paise) / 100.0, 2) as total_sales
       FROM order_items oi
       JOIN orders o ON oi.order_id = o.id
       WHERE o.payment_status = 'PAID' AND o.created_at >= ? AND o.created_at < ?
       GROUP BY oi.item_name
       ORDER BY total_qty DESC
       LIMIT 10`,
      params
    );

    // Per business day. Grouped here rather than in SQL so it is right for any time zone,
    // including daylight-saving changes and a non-midnight cutoff.
    const rows = await all(
      `SELECT created_at, payment_status, final_amount_paise, discount_paise, customer_id
       FROM orders WHERE ${inRange}`,
      params
    );
    const days = new Map();
    for (const r of rows) {
      const key = calendar.businessDate(new Date(r.created_at));
      let d = days.get(key);
      if (!d) {
        d = { date: key, paid_orders_count: 0, revenue_paise: 0, discount_paise: 0, customer_orders: 0, guest_orders: 0 };
        days.set(key, d);
      }
      if (r.payment_status !== 'PAID') continue;
      d.paid_orders_count += 1;
      d.revenue_paise += r.final_amount_paise;
      d.discount_paise += r.discount_paise;
      if (r.customer_id) d.customer_orders += 1;
      else d.guest_orders += 1;
    }
    const dailyBreakdown = [...days.values()]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map(({ revenue_paise, discount_paise, ...d }) => ({
        ...d,
        total_revenue: rupees(revenue_paise),
        total_discounts: rupees(discount_paise)
      }));

    return res.json({
      startDate: start,
      endDate: end,
      date: start === end ? start : `${start} to ${end}`,
      time_zone: calendar.getTimeZone(),
      business_day_cutoff: calendar.getCutoffMinutes(),
      summary,
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
