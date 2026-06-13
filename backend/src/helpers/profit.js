function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundPercent(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function computeSaleItemProfit({ qty, unit_price, discount = 0 }, costPrice = 0) {
  const subtotal = roundMoney((qty * unit_price) - (discount || 0));
  const cost_price_snapshot = roundMoney(Number(costPrice || 0));
  const line_cost = roundMoney(qty * cost_price_snapshot);
  const line_profit = roundMoney(subtotal - line_cost);
  const profit_margin = subtotal > 0 ? roundPercent((line_profit / subtotal) * 100) : 0;

  return {
    subtotal,
    cost_price_snapshot,
    line_cost,
    line_profit,
    profit_margin,
  };
}

function aggregateProfitTotals(items = []) {
  const cost_of_goods_sold = roundMoney(items.reduce((sum, row) => sum + Number(row.line_cost || 0), 0));
  const gross_profit = roundMoney(items.reduce((sum, row) => sum + Number(row.line_profit || 0), 0));
  const revenue = roundMoney(items.reduce((sum, row) => sum + Number(row.subtotal || 0), 0));
  const gross_margin = revenue > 0 ? roundPercent((gross_profit / revenue) * 100) : 0;

  return {
    revenue,
    cost_of_goods_sold,
    gross_profit,
    gross_margin,
  };
}

module.exports = {
  roundMoney,
  roundPercent,
  computeSaleItemProfit,
  aggregateProfitTotals,
};
