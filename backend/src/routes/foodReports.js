const express = require('express');
const supabase = require('../config/supabase');
const { authenticate, requireRole } = require('../middleware/auth');
const tenantScope = require('../middleware/tenantScope');
const { buildBusinessSummary, buildLoanReadiness } = require('../services/businessSummary');
const { buildBusinessReportPdfBuffer } = require('../helpers/businessReportPdf');

const router = express.Router();
router.use(authenticate, tenantScope, requireRole('owner', 'manager'));

router.get('/business-summary', async (req, res) => {
  try {
    const summary = await buildBusinessSummary(supabase, req.businessId, {
      period: req.query.period,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load business summary.' });
  }
});

router.get('/loan-readiness', async (req, res) => {
  try {
    const report = await buildLoanReadiness(supabase, req.businessId, {
      period: req.query.period,
      from: req.query.from,
      to: req.query.to,
    });
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to load loan readiness.' });
  }
});

router.get('/business-report/pdf', async (req, res) => {
  try {
    const [{ data: business }, summary, loanReadiness] = await Promise.all([
      supabase.from('businesses').select('name, phone').eq('id', req.businessId).single(),
      buildBusinessSummary(supabase, req.businessId, {
        period: req.query.period,
        from: req.query.from,
        to: req.query.to,
      }),
      buildLoanReadiness(supabase, req.businessId, {
        period: req.query.period,
        from: req.query.from,
        to: req.query.to,
      }),
    ]);

    const pdfBuffer = await buildBusinessReportPdfBuffer({ business, summary, loanReadiness });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="business-report.pdf"');
    res.send(pdfBuffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate business report PDF.' });
  }
});

router.get('/food', async (req, res) => {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;

  let ordersQuery = supabase.from('orders')
    .select('id, status, total_amount, created_at, order_items(item_name_snapshot, qty, line_total)')
    .eq('business_id', req.businessId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (from) ordersQuery = ordersQuery.gte('created_at', from);
  if (to) ordersQuery = ordersQuery.lte('created_at', to);

  const { data: orders, error } = await ordersQuery;
  if (error) return res.status(500).json({ error: error.message });

  const rows = orders || [];
  const completed = rows.filter((o) => o.status === 'completed');
  const cancelled = rows.filter((o) => o.status === 'cancelled');
  const pending = rows.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status));

  const topMealsMap = new Map();
  for (const order of completed) {
    for (const item of order.order_items || []) {
      const key = item.item_name_snapshot || 'Meal';
      const prev = topMealsMap.get(key) || { name: key, qty: 0, revenue: 0 };
      prev.qty += Number(item.qty || 0);
      prev.revenue += Number(item.line_total || 0);
      topMealsMap.set(key, prev);
    }
  }

  const topMeals = [...topMealsMap.values()]
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  const totalRevenue = completed.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
  const cancellationRate = rows.length > 0 ? (cancelled.length / rows.length) * 100 : 0;

  res.json({
    total_orders: rows.length,
    completed_orders: completed.length,
    pending_orders: pending.length,
    cancelled_orders: cancelled.length,
    cancellation_rate: Number(cancellationRate.toFixed(2)),
    revenue: Number(totalRevenue.toFixed(2)),
    avg_order_value: completed.length > 0 ? Number((totalRevenue / completed.length).toFixed(2)) : 0,
    top_meals: topMeals,
  });
});

module.exports = router;
