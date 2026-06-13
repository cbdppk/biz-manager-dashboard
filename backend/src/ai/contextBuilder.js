const supabase = require('../config/supabase');
const { getCached, setCache } = require('./contextCache');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Full context — used for deep /ask queries.
 * Cached 5 min so repeated messages in a conversation don't re-query.
 */
async function getBusinessContext(businessId) {
  const cached = getCached(businessId);
  if (cached) return cached;

  const now = Date.now();
  const todayStart   = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const weekAgo      = new Date(now - 7  * 86400000).toISOString();
  const twoWeeksAgo  = new Date(now - 14 * 86400000).toISOString();
  const fourWeeksAgo = new Date(now - 28 * 86400000).toISOString();

  const [business, todaySales, weeklySales, lastWeekSales, fourWeekSales, allProducts, topDebtors, customers] = await Promise.all([
    supabase.from('businesses').select('name, sector').eq('id', businessId).single(),
    supabase.from('sales').select('total_amount, amount_paid, payment_method')
      .eq('business_id', businessId).gte('created_at', todayStart),
    supabase.from('sales').select('id, total_amount, customer_id')
      .eq('business_id', businessId).gte('created_at', weekAgo),
    supabase.from('sales').select('id, customer_id')
      .eq('business_id', businessId).gte('created_at', twoWeeksAgo).lt('created_at', weekAgo),
    supabase.from('sales').select('total_amount, created_at')
      .eq('business_id', businessId).gte('created_at', fourWeeksAgo),
    supabase.from('products').select('name, stock_qty, reorder_level')
      .eq('business_id', businessId).eq('is_active', true),
    supabase.from('credit_ledger').select('amount, customers(name)')
      .eq('business_id', businessId).eq('type', 'debt').eq('settled', false)
      .order('amount', { ascending: false }).limit(3),
    supabase.from('customers').select('id, name').eq('business_id', businessId).order('name').limit(12),
  ]);

  const lowStock = (allProducts.data || [])
    .filter(p => p.stock_qty <= (p.reorder_level ?? 5))
    .slice(0, 4);

  const todayTotal     = todaySales.data?.reduce((s, r) => s + r.total_amount, 0) || 0;
  const todayCollected = todaySales.data?.reduce((s, r) => s + r.amount_paid, 0) || 0;
  const weekTotal      = weeklySales.data?.reduce((s, r) => s + r.total_amount, 0) || 0;

  const thisWeekSaleIds = weeklySales.data?.map(s => s.id).filter(Boolean) || [];
  let topByRevenue = [], topByVolume = [];

  if (thisWeekSaleIds.length > 0) {
    const { data: saleItems } = await supabase
      .from('sale_items')
      .select('product_id, qty, subtotal, products(name)')
      .in('sale_id', thisWeekSaleIds);

    const productMap = {};
    (saleItems || []).forEach(item => {
      const pid = item.product_id;
      if (!productMap[pid]) productMap[pid] = { name: item.products?.name || pid, revenue: 0, units: 0 };
      productMap[pid].revenue += item.subtotal || 0;
      productMap[pid].units   += item.qty || 0;
    });

    const sorted = Object.values(productMap).sort((a, b) => b.revenue - a.revenue);
    topByRevenue = sorted.slice(0, 3).map(p => ({ name: p.name, revenue: p.revenue.toFixed(2) }));
    topByVolume  = [...sorted].sort((a, b) => b.units - a.units).slice(0, 3).map(p => ({ name: p.name, units: p.units }));
  }

  // Day-of-week pattern (only peak/slow days, not all 7)
  const dayTotals = Array(7).fill(0);
  const dayCounts = Array(7).fill(0);
  (fourWeekSales.data || []).forEach(sale => {
    const day = new Date(sale.created_at).getDay();
    dayTotals[day] += sale.total_amount || 0;
    dayCounts[day]++;
  });
  const avgByDay = DAY_NAMES.map((name, i) => ({
    day: name,
    avg: dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0
  }));
  const peakDay = avgByDay.reduce((best, d) => d.avg > best.avg ? d : best, avgByDay[0]);
  const slowDay = avgByDay.reduce((slow, d) => d.avg < slow.avg ? d : slow, avgByDay[0]);

  // Retention (simple count)
  const thisWeekCustomers = new Set((weeklySales.data || []).map(s => s.customer_id).filter(Boolean));
  const lastWeekCustomers = new Set((lastWeekSales.data || []).map(s => s.customer_id).filter(Boolean));
  const retainedCount = [...thisWeekCustomers].filter(id => lastWeekCustomers.has(id)).length;

  const data = {
    business: business.data,
    today: {
      total: todayTotal,
      collected: todayCollected,
      credit: todayTotal - todayCollected,
      txCount: todaySales.data?.length || 0
    },
    week: { total: weekTotal },
    lowStock,
    products: (allProducts.data || []).slice(0, 12).map((product) => ({
      name: product.name,
      stock_qty: product.stock_qty,
      reorder_level: product.reorder_level,
    })),
    customers: customers.data || [],
    topDebtors: topDebtors.data || [],
    topByRevenue,
    topByVolume,
    peak: { day: peakDay.day, avg: peakDay.avg.toFixed(2) },
    slow: { day: slowDay.day, avg: slowDay.avg.toFixed(2) },
    retention: {
      retained: retainedCount,
      thisWeek: thisWeekCustomers.size,
      lastWeek: lastWeekCustomers.size
    }
  };

  setCache(businessId, data);
  return data;
}

/**
 * Slim context — used only for /insights greeting.
 * Only today + low-stock. No sale_items join, no DOW, no retention.
 */
async function getSlimContext(businessId) {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

  const [business, todaySales, lowStockProducts] = await Promise.all([
    supabase.from('businesses').select('name, sector').eq('id', businessId).single(),
    supabase.from('sales').select('total_amount, amount_paid')
      .eq('business_id', businessId).gte('created_at', todayStart),
    supabase.from('products').select('name, stock_qty, reorder_level')
      .eq('business_id', businessId).eq('is_active', true)
      .lte('stock_qty', 5).limit(4),
  ]);

  const todayTotal     = todaySales.data?.reduce((s, r) => s + r.total_amount, 0) || 0;
  const todayCollected = todaySales.data?.reduce((s, r) => s + r.amount_paid, 0) || 0;

  return {
    business: business.data,
    today: {
      total: todayTotal,
      collected: todayCollected,
      txCount: todaySales.data?.length || 0
    },
    lowStock: (lowStockProducts.data || []).slice(0, 4)
  };
}

module.exports = { getBusinessContext, getSlimContext };
