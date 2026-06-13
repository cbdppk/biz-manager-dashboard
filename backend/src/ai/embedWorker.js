// Nightly embed worker — summarises each business day and stores in ai_embeddings
require('dotenv').config();
const cron = require('node-cron');
const supabase = require('../config/supabase');

async function embedBusinessDay(businessId, today) {
  try {
    // 1. Today's sales summary
    const { data: sales } = await supabase.from('sales')
      .select('id, total_amount, payment_method')
      .eq('business_id', businessId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    if (!sales?.length) {
      console.log(`[embedWorker] No sales for business ${businessId} on ${today} — skipping`);
      return;
    }

    const totalRevenue = sales.reduce((s, r) => s + (r.total_amount || 0), 0);
    const saleCount = sales.length;
    const saleIds = sales.map((s) => s.id);

    const { data: saleItems } = await supabase.from('sale_items')
      .select('qty, products(name)')
      .in('sale_id', saleIds);

    const productCounts = {};
    for (const item of saleItems || []) {
      const name = item.products?.name || 'Unknown';
      productCounts[name] = (productCounts[name] || 0) + Number(item.qty || 1);
    }
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, qty]) => `${name} (${qty})`)
      .join(', ');

    // 2. New customers today
    const { data: newCustomers } = await supabase.from('customers')
      .select('name')
      .eq('business_id', businessId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    const customerLine = newCustomers?.length
      ? `${newCustomers.length} new customer(s) were added: ${newCustomers.map(c => c.name).join(', ')}.`
      : 'No new customers were added today.';

    // 3. Credit ledger activity today
    const { data: creditEvents } = await supabase.from('credit_ledger')
      .select('amount, type')
      .eq('business_id', businessId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    const creditCount = creditEvents?.length || 0;
    const paymentsReceived = (creditEvents || [])
      .filter((row) => row.type === 'payment')
      .reduce((s, row) => s + Math.abs(Number(row.amount || 0)), 0);
    const creditLine = creditCount > 0
      ? `${creditCount} credit ledger event(s). Payments received: GHS ${paymentsReceived.toFixed(2)}.`
      : 'No credit ledger activity today.';

    // 4. Build plain-English summary
    const summary = [
      `Daily business summary for ${today}:`,
      `Sales: ${saleCount} transaction(s) totalling GHS ${totalRevenue.toFixed(2)}.`,
      topProducts ? `Top products sold: ${topProducts}.` : '',
      customerLine,
      creditLine,
    ].filter(Boolean).join(' ');

    // 5. Store in ai_embeddings
    await supabase.from('ai_embeddings').upsert({
      business_id: businessId,
      content: summary,
      type: 'daily_summary',
      date: today,
      created_at: new Date().toISOString(),
    }, { onConflict: 'business_id,type,date' });

    console.log(`[embedWorker] ✓ Embedded daily summary for business ${businessId}`);
  } catch (err) {
    console.error(`[embedWorker] ✗ Failed for business ${businessId}:`, err.message);
  }
}

async function runEmbedWorker() {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[embedWorker] Starting nightly embed run for ${today}`);

  const { data: businesses, error } = await supabase.from('businesses')
    .select('id');

  if (error) {
    console.error('[embedWorker] Failed to fetch businesses:', error.message);
    return;
  }

  if (!businesses?.length) {
    console.log('[embedWorker] No active businesses found.');
    return;
  }

  for (const biz of businesses) {
    await embedBusinessDay(biz.id, today);
  }

  console.log(`[embedWorker] Nightly run complete — processed ${businesses.length} business(es).`);
}

// Schedule at 11:59pm daily
cron.schedule('59 23 * * *', () => {
  console.log('[embedWorker] Cron triggered at 23:59');
  runEmbedWorker().catch(err => console.error('[embedWorker] Unhandled error:', err.message));
});

console.log('[embedWorker] Nightly cron scheduled (23:59 daily).');

module.exports = { embedBusinessDay, runEmbedWorker };
