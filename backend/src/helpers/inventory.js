function aggregateSaleItems(items = []) {
  const requests = new Map();

  for (const item of items) {
    if (!item?.product_id) continue;
    const qty = Number(item.qty || 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const existing = requests.get(item.product_id);
    requests.set(item.product_id, {
      product_id: item.product_id,
      qty: (existing?.qty || 0) + qty,
    });
  }

  return Array.from(requests.values());
}

function buildInsufficientStockIssues(products = [], items = []) {
  const productMap = new Map((products || []).map((product) => [product.id, product]));

  return aggregateSaleItems(items).flatMap((request) => {
    const product = productMap.get(request.product_id);

    if (!product) {
      return [{
        product_id: request.product_id,
        product_name: 'Unknown product',
        requested_qty: request.qty,
        available_qty: 0,
        reason: 'missing_product',
      }];
    }

    if (product.is_active === false) {
      return [{
        product_id: request.product_id,
        product_name: product.name,
        requested_qty: request.qty,
        available_qty: 0,
        reason: 'inactive_product',
      }];
    }

    const availableQty = Number(product.stock_qty || 0);
    if (availableQty >= request.qty) {
      return [];
    }

    return [{
      product_id: request.product_id,
      product_name: product.name,
      requested_qty: request.qty,
      available_qty: availableQty,
      reason: 'insufficient_stock',
    }];
  });
}

module.exports = {
  aggregateSaleItems,
  buildInsufficientStockIssues,
};
