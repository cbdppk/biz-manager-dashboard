const { roundMoney, roundPercent } = require('../helpers/profit');

function resolveDateRange({ period = 'today', from, to } = {}) {
  const now = new Date();
  let start;
  let end = to ? new Date(to) : now;

  if (from) {
    start = new Date(from);
  } else if (period === 'week') {
    start = new Date(now.getTime() - 7 * 86400000);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'all') {
    start = new Date(0);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  return {
    period,
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

async function fetchCreditOutstanding(supabase, businessId) {
  const { data, error } = await supabase
    .from('credit_ledger')
    .select('amount')
    .eq('business_id', businessId)
    .eq('type', 'debt')
    .eq('settled', false);

  if (error) throw error;
  return roundMoney((data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function fetchStockSnapshot(supabase, businessId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, stock_qty, reorder_level, cost_price')
    .eq('business_id', businessId)
    .eq('is_active', true);

  if (error) throw error;

  const products = data || [];
  const stock_value = roundMoney(products.reduce(
    (sum, product) => sum + (Number(product.cost_price || 0) * Number(product.stock_qty || 0)),
    0,
  ));
  const low_stock = products
    .filter((product) => Number(product.stock_qty || 0) <= Number(product.reorder_level ?? 5))
    .slice(0, 10)
    .map((product) => ({
      id: product.id,
      name: product.name,
      stock_qty: product.stock_qty,
    }));

  return { stock_value, low_stock, products };
}

async function fetchExpensesTotal(supabase, businessId, from, to) {
  let query = supabase
    .from('expenses')
    .select('amount')
    .eq('business_id', businessId);

  if (from) query = query.gte('expense_date', from.slice(0, 10));
  if (to) query = query.lte('expense_date', to.slice(0, 10));

  const { data, error } = await query;
  if (error) {
    if (error.message?.toLowerCase().includes('expenses')) return 0;
    throw error;
  }

  return roundMoney((data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0));
}

async function buildBusinessSummary(supabase, businessId, options = {}) {
  const { period, from, to } = resolveDateRange(options);

  const [salesRes, stockSnapshot, creditOutstanding, expensesTotal] = await Promise.all([
    supabase.from('sales')
      .select('id, total_amount, amount_paid, balance, payment_method, created_at, customers(name)')
      .eq('business_id', businessId)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false }),
    fetchStockSnapshot(supabase, businessId),
    fetchCreditOutstanding(supabase, businessId),
    fetchExpensesTotal(supabase, businessId, from, to),
  ]);

  if (salesRes.error) throw salesRes.error;

  const rows = salesRes.data || [];
  const revenue = roundMoney(rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0));
  const cash_collected = roundMoney(rows.reduce((sum, row) => sum + Number(row.amount_paid || 0), 0));
  const period_credit = roundMoney(rows.reduce((sum, row) => sum + Number(row.balance || 0), 0));
  const transactions = rows.length;
  const avg_order = transactions > 0 ? roundMoney(revenue / transactions) : 0;

  let cost_of_goods_sold = 0;
  let gross_profit = 0;
  const saleIds = rows.map((row) => row.id);
  if (saleIds.length > 0) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('sale_items')
      .select('line_cost, line_profit, subtotal, qty, product_id, products(name)')
      .in('sale_id', saleIds);

    if (itemsError) throw itemsError;

    cost_of_goods_sold = roundMoney((itemRows || []).reduce((sum, row) => sum + Number(row.line_cost || 0), 0));
    gross_profit = roundMoney((itemRows || []).reduce((sum, row) => sum + Number(row.line_profit || 0), 0));
  }

  const gross_margin = revenue > 0 ? roundPercent((gross_profit / revenue) * 100) : 0;
  const net_profit = roundMoney(gross_profit - expensesTotal);
  const net_margin = revenue > 0 ? roundPercent((net_profit / revenue) * 100) : 0;

  const recent = rows.slice(0, 5).map((row) => ({
    id: row.id,
    customer_name: row.customers?.name ?? null,
    created_at: row.created_at,
    total: row.total_amount,
    payment_method: row.payment_method,
  }));

  let top_products = [];
  if (saleIds.length > 0) {
    const { data: itemRows } = await supabase
      .from('sale_items')
      .select('qty, subtotal, line_profit, products(name)')
      .in('sale_id', saleIds);

    const productMap = new Map();
    for (const item of itemRows || []) {
      const name = item.products?.name || 'Item';
      const prev = productMap.get(name) || { name, qty: 0, revenue: 0, profit: 0 };
      prev.qty += Number(item.qty || 0);
      prev.revenue = roundMoney(prev.revenue + Number(item.subtotal || 0));
      prev.profit = roundMoney(prev.profit + Number(item.line_profit || 0));
      productMap.set(name, prev);
    }
    top_products = [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }

  const { data: creditCustomers } = await supabase
    .from('credit_ledger')
    .select('amount, customers(name, phone)')
    .eq('business_id', businessId)
    .eq('type', 'debt')
    .eq('settled', false)
    .order('created_at', { ascending: false })
    .limit(5);

  const recent_credit_customers = (creditCustomers || []).map((row) => ({
    name: row.customers?.name || 'Customer',
    phone: row.customers?.phone || null,
    amount: Number(row.amount || 0),
  }));

  return {
    period,
    from,
    to,
    revenue,
    cash_collected,
    credit_outstanding: creditOutstanding,
    period_credit,
    cost_of_goods_sold,
    gross_profit,
    gross_margin,
    expenses: expensesTotal,
    net_profit,
    net_margin,
    transactions,
    avg_order,
    stock_value: stockSnapshot.stock_value,
    low_stock: stockSnapshot.low_stock,
    low_stock_count: stockSnapshot.low_stock.length,
    recent,
    top_products,
    recent_credit_customers,
    total_sales: revenue,
    total_collected: cash_collected,
    total_credit: period_credit,
    count: transactions,
  };
}

function gradeFromScore(score) {
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Good';
  if (score >= 45) return 'Fair';
  return 'Needs Records';
}

async function buildLoanReadiness(supabase, businessId, options = {}) {
  const summary = await buildBusinessSummary(supabase, businessId, options);
  const { products } = await fetchStockSnapshot(supabase, businessId);

  const { data: allProducts } = await supabase
    .from('products')
    .select('id, cost_price, is_active')
    .eq('business_id', businessId)
    .eq('is_active', true);

  const activeProducts = allProducts || [];
  const withCost = activeProducts.filter((product) => Number(product.cost_price || 0) > 0).length;
  const costCoverage = activeProducts.length > 0 ? withCost / activeProducts.length : 0;

  const { data: expenseRows } = await supabase
    .from('expenses')
    .select('expense_date')
    .eq('business_id', businessId)
    .gte('expense_date', summary.from.slice(0, 10))
    .lte('expense_date', summary.to.slice(0, 10));

  const { data: salesDaysRows } = await supabase
    .from('sales')
    .select('created_at')
    .eq('business_id', businessId)
    .gte('created_at', summary.from)
    .lte('created_at', summary.to);

  const sellingDays = new Set((salesDaysRows || []).map((row) => row.created_at.slice(0, 10))).size;
  const expenseDays = new Set((expenseRows || []).map((row) => row.expense_date)).size;

  const msPerDay = 86400000;
  const rangeDays = Math.max(1, Math.ceil((new Date(summary.to) - new Date(summary.from)) / msPerDay));
  const monthsInRange = Math.max(1, rangeDays / 30);

  const average_monthly_revenue = roundMoney(summary.revenue / monthsInRange);
  const average_monthly_net_profit = roundMoney(summary.net_profit / monthsInRange);
  const cash_collection_rate = summary.revenue > 0
    ? roundPercent((summary.cash_collected / summary.revenue) * 100)
    : 0;
  const expense_to_revenue_ratio = summary.revenue > 0
    ? roundPercent((summary.expenses / summary.revenue) * 100)
    : 0;

  let record_completeness = 0;
  if (activeProducts.length > 0) record_completeness += costCoverage * 12;
  if (summary.transactions > 0) record_completeness += 8;
  if (expenseDays > 0) record_completeness += 5;
  record_completeness = roundPercent(Math.min(25, record_completeness));

  const profitStrength = average_monthly_net_profit <= 0
    ? 0
    : roundPercent(Math.min(25, (average_monthly_net_profit / Math.max(average_monthly_revenue, 1)) * 100));

  const cashScore = roundPercent(Math.min(20, (cash_collection_rate / 100) * 20));
  const consistencyScore = roundPercent(Math.min(15, (sellingDays / Math.max(rangeDays, 1)) * 15));
  const creditPressure = summary.revenue > 0
    ? summary.credit_outstanding / summary.revenue
    : summary.credit_outstanding > 0 ? 1 : 0;
  const creditScore = roundPercent(Math.max(0, 10 - (creditPressure * 10)));
  const stockHealthScore = products.some((product) => Number(product.stock_qty || 0) > 0)
    ? roundPercent(Math.max(0, 5 - (summary.low_stock_count * 0.5)))
    : 0;

  const score = Math.round(
    record_completeness + profitStrength + cashScore + consistencyScore + creditScore + stockHealthScore,
  );

  const strengths = [];
  const risks = [];

  if (costCoverage >= 0.8) strengths.push('Most products have cost prices set.');
  else risks.push('Add cost prices to products for accurate profit records.');

  if (summary.expenses > 0) strengths.push('Expenses are being recorded.');
  else risks.push('Start recording expenses to show true net profit.');

  if (summary.transactions >= 5) strengths.push('Sales activity is being tracked consistently.');
  else risks.push('Record more sales to build a stronger history.');

  if (average_monthly_net_profit > 0) strengths.push('Business shows positive net profit in this period.');
  else risks.push('Net profit is zero or negative in this period.');

  if (summary.credit_outstanding > summary.revenue * 0.3 && summary.credit_outstanding > 0) {
    risks.push('Customer credit outstanding is relatively high.');
  } else if (summary.credit_outstanding === 0) {
    strengths.push('No outstanding customer credit.');
  }

  if (summary.low_stock_count > 0) {
    risks.push(`${summary.low_stock_count} products are low on stock.`);
  }

  const estimated_safe_monthly_repayment = average_monthly_net_profit > 0
    ? roundMoney(average_monthly_net_profit * 0.25)
    : 0;

  return {
    score,
    grade: gradeFromScore(score),
    estimated_safe_monthly_repayment,
    average_monthly_revenue,
    average_monthly_net_profit,
    cash_collection_rate,
    credit_outstanding: summary.credit_outstanding,
    expense_to_revenue_ratio,
    record_completeness: roundPercent((record_completeness / 25) * 100),
    selling_days: sellingDays,
    expense_days: expenseDays,
    strengths,
    risks,
    disclaimer: 'This is an estimate based on your records. It is not a bank decision.',
  };
}

module.exports = {
  resolveDateRange,
  buildBusinessSummary,
  buildLoanReadiness,
  fetchCreditOutstanding,
  fetchStockSnapshot,
};
