const { v4: uuidv4 } = require('uuid');
const { aggregateSaleItems, buildInsufficientStockIssues } = require('../helpers/inventory');
const { computeSaleItemProfit } = require('../helpers/profit');

function normalizePaymentMethod(paymentMethod) {
  const raw = String(paymentMethod || 'cash').toLowerCase().trim();
  if (['momo', 'mobile money', 'mobile_money', 'mtn'].includes(raw)) return 'momo';
  if (['card', 'debit'].includes(raw)) return 'card';
  if (['credit', 'on credit'].includes(raw)) return 'credit';
  if (['cash', 'momo', 'card', 'credit'].includes(raw)) return raw;
  return 'cash';
}

async function assertSaleCustomerOwnership(supabase, customerId, businessId) {
  if (!customerId) return;

  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('business_id', businessId)
    .single();

  if (error || !data) {
    const err = new Error('Customer does not belong to this business.');
    err.status = 400;
    throw err;
  }
}

async function createSale({
  supabase,
  businessId,
  userId,
  customerId = null,
  items,
  paymentMethod,
  amountPaid,
  note,
  skipStockProductIds = [],
}) {
  await assertSaleCustomerOwnership(supabase, customerId, businessId);

  const saleId = uuidv4();
  const method = normalizePaymentMethod(paymentMethod);
  const total = items.reduce((sum, item) => sum + (item.qty * item.unit_price) - (item.discount || 0), 0);
  const balance = Math.max(0, total - amountPaid);

  const skippedStockIds = new Set(skipStockProductIds);
  const stockTrackedItems = items.filter((item) => !skippedStockIds.has(item.product_id));
  const requestedItems = aggregateSaleItems(stockTrackedItems);
  const allProductIds = [...new Set(items.map((item) => item.product_id))];
  let inventoryRows = [];

  if (allProductIds.length > 0) {
    const { data, error: inventoryError } = await supabase
      .from('products')
      .select('id, name, stock_qty, reorder_level, is_active, cost_price')
      .eq('business_id', businessId)
      .in('id', allProductIds);

    if (inventoryError) throw inventoryError;
    inventoryRows = data || [];

    const stockIssues = buildInsufficientStockIssues(inventoryRows, stockTrackedItems);
    if (stockIssues.length > 0) {
      const err = new Error('One or more products do not have enough stock for this sale.');
      err.status = 409;
      err.code = 'INSUFFICIENT_STOCK';
      err.products = stockIssues;
      throw err;
    }
  }

  const inventoryMap = new Map((inventoryRows || []).map((row) => [row.id, row]));
  const { data: sale, error } = await supabase.from('sales').insert({
    id: saleId,
    business_id: businessId,
    customer_id: customerId || null,
    cashier_id: userId,
    total_amount: total,
    amount_paid: amountPaid,
    balance,
    payment_method: method,
    note,
    status: balance > 0 ? 'partial' : 'paid',
  }).select().single();

  if (error) throw error;

  const saleItems = items.map((item) => {
    const product = inventoryMap.get(item.product_id);
    const profit = computeSaleItemProfit(item, product?.cost_price);
    return {
      sale_id: saleId,
      product_id: item.product_id,
      qty: item.qty,
      unit_price: item.unit_price,
      discount: item.discount || 0,
      subtotal: profit.subtotal,
      cost_price_snapshot: profit.cost_price_snapshot,
      line_cost: profit.line_cost,
      line_profit: profit.line_profit,
      profit_margin: profit.profit_margin,
    };
  });

  const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
  if (itemsError) throw itemsError;

  for (const item of stockTrackedItems) {
    const { error: rpcError } = await supabase.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_qty: item.qty,
      p_business_id: businessId,
    });
    if (rpcError) throw rpcError;
  }

  const stockMovements = requestedItems.map((request) => {
    const before = Number(inventoryMap.get(request.product_id)?.stock_qty || 0);
    const after = Math.max(0, before - request.qty);
    const reorderLevel = Number(inventoryMap.get(request.product_id)?.reorder_level || 5);

    return {
      business_id: businessId,
      product_id: request.product_id,
      movement_type: 'sale',
      quantity_change: -request.qty,
      quantity_before: before,
      quantity_after: after,
      note: `Sale ${saleId}`,
      reference_type: 'sale',
      reference_id: saleId,
      actor_user_id: userId,
      metadata: {
        sale_id: saleId,
        product_name: inventoryMap.get(request.product_id)?.name || null,
        reorder_level: reorderLevel,
      },
    };
  });

  if (stockMovements.length > 0) {
    const { error: movementError } = await supabase.from('stock_movements').insert(stockMovements);
    if (movementError && !movementError.message?.toLowerCase().includes('stock_movements')) {
      throw movementError;
    }
  }

  for (const request of requestedItems) {
    const before = Number(inventoryMap.get(request.product_id)?.stock_qty || 0);
    const reorderLevel = Number(inventoryMap.get(request.product_id)?.reorder_level || 5);
    const after = Math.max(0, before - request.qty);

    await supabase.from('products')
      .update({ needs_restock: after <= reorderLevel })
      .eq('id', request.product_id)
      .eq('business_id', businessId);
  }

  if (balance > 0 && customerId) {
    await supabase.from('credit_ledger').insert({
      business_id: businessId,
      customer_id: customerId,
      sale_id: saleId,
      amount: balance,
      type: 'debt',
      due_date: new Date(Date.now() + 30 * 86400000),
      settled: false,
    });
  }

  return {
    saleId,
    sale,
    method,
    total,
    balance,
  };
}

module.exports = {
  createSale,
  assertSaleCustomerOwnership,
};
