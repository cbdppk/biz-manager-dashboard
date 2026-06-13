function buildRecipeDeductions(saleItems, recipes) {
  const recipeMap = new Map((recipes || []).map((recipe) => [recipe.menu_product_id, recipe]));
  const deductions = new Map();

  for (const soldItem of saleItems || []) {
    const recipe = recipeMap.get(soldItem.product_id);
    if (!recipe) continue;

    const orderQty = Number(soldItem.qty || 0);
    const yieldQty = Number(recipe.yield_qty || 1) || 1;

    for (const ingredient of recipe.recipe_items || []) {
      const baseQty = Number(ingredient.qty_required || 0);
      const wasteFactor = Number(ingredient.waste_factor || 0);
      const qty = Math.ceil((orderQty / yieldQty) * baseQty * (1 + wasteFactor));
      if (qty <= 0) continue;
      const current = deductions.get(ingredient.ingredient_product_id) || 0;
      deductions.set(ingredient.ingredient_product_id, current + qty);
    }
  }

  return Array.from(deductions.entries()).map(([ingredient_product_id, qty]) => ({
    ingredient_product_id,
    qty,
  }));
}

module.exports = { buildRecipeDeductions };
