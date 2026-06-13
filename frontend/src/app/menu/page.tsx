'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { menuAPI, productsAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface Category {
  id: string;
  name: string;
  is_active?: boolean;
}

interface Product {
  id: string;
  name: string;
  price: number;
  cost_price?: number | null;
  stock_qty: number;
  menu_category_id?: string | null;
  is_available?: boolean;
  prep_time_minutes?: number | null;
}


interface OptionValue {
  label: string;
  price_delta: string;
}

const labelStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
};

const panelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 10,
};

function money(value: number | string | null | undefined) {
  return `GHS ${Number(value || 0).toFixed(2)}`;
}

export default function MenuPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryName, setCategoryName] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [itemForm, setItemForm] = useState({
    name: '',
    price: '',
    costPrice: '',
    categoryId: '',
    prepTime: '',
    stockQty: '0',
  });
  const [optionForm, setOptionForm] = useState({
    productId: '',
    name: '',
    values: [{ label: '', price_delta: '' }] as OptionValue[],
  });
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [categoryRes, itemRes] = await Promise.all([
        menuAPI.categories(),
        productsAPI.list({ menu_only: true, limit: 250 }),
      ]);
      const nextCategories = categoryRes.data || [];
      const nextItems = itemRes.data || [];
      setCategories(nextCategories);
      setItems(nextItems);
      setItemForm((current) => current.categoryId || !nextCategories[0]?.id
        ? current
        : { ...current, categoryId: nextCategories[0].id });
    } catch {
      showToast('Could not load menu setup.', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredItems = activeCategory
    ? items.filter((item) => item.menu_category_id === activeCategory)
    : items;

  const groupedItems = useMemo(() => {
    const groups = categories.map((category) => ({
      category,
      items: filteredItems.filter((item) => item.menu_category_id === category.id),
    }));
    const uncategorized = filteredItems.filter((item) => !item.menu_category_id);
    return { groups, uncategorized };
  }, [activeCategory, categories, filteredItems]);

  const availableCount = items.filter((item) => item.is_available !== false).length;
  const menuValue = items.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const avgPrice = items.length > 0 ? menuValue / items.length : 0;

  async function toggleAvailability(item: Product) {
    setTogglingId(item.id);
    try {
      await productsAPI.update(item.id, { is_available: item.is_available === false });
      setItems((prev) =>
        prev.map((p) =>
          p.id === item.id ? { ...p, is_available: item.is_available === false } : p
        )
      );
    } catch {
      showToast('Could not update availability.', 'error');
    } finally {
      setTogglingId(null);
    }
  }

  async function createCategory(ev: React.FormEvent) {
    ev.preventDefault();
    const name = categoryName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const res = await menuAPI.createCategory({ name, sort_order: categories.length });
      setCategories((current) => [...current, res.data]);
      setCategoryName('');
      setActiveCategory(res.data.id);
      setItemForm((current) => ({ ...current, categoryId: res.data.id }));
      showToast('Category added.', 'success');
    } catch {
      showToast('Could not add category.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function createMenuItem(ev: React.FormEvent) {
    ev.preventDefault();
    if (!itemForm.name.trim() || Number(itemForm.price) <= 0) return;
    setSaving(true);
    try {
      await productsAPI.create({
        name: itemForm.name.trim(),
        price: Number(itemForm.price),
        cost_price: itemForm.costPrice ? Number(itemForm.costPrice) : undefined,
        stock_qty: Number(itemForm.stockQty || 0),
        reorder_level: 0,
        unit: 'plate',
        is_menu_item: true,
        menu_category_id: itemForm.categoryId || null,
        prep_time_minutes: itemForm.prepTime ? Number(itemForm.prepTime) : null,
        is_available: true,
      });
      setItemForm({ name: '', price: '', costPrice: '', categoryId: itemForm.categoryId, prepTime: '', stockQty: '0' });
      await load();
      showToast('Meal added to menu.', 'success');
    } catch {
      showToast('Could not add menu item.', 'error');
    } finally {
      setSaving(false);
    }
  }

  function updateOptionValue(index: number, field: keyof OptionValue, value: string) {
    setOptionForm((current) => ({
      ...current,
      values: current.values.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row),
    }));
  }

  async function createOption(ev: React.FormEvent) {
    ev.preventDefault();
    const values = optionForm.values
      .filter((value) => value.label.trim())
      .map((value) => ({ label: value.label.trim(), price_delta: Number(value.price_delta || 0) }));

    if (!optionForm.productId || !optionForm.name.trim() || values.length === 0) return;
    setSaving(true);
    try {
      await menuAPI.createOption({
        product_id: optionForm.productId,
        name: optionForm.name.trim(),
        min_select: 0,
        max_select: values.length,
        values,
      });
      setOptionForm({ productId: optionForm.productId, name: '', values: [{ label: '', price_delta: '' }] });
      showToast('Add-ons saved.', 'success');
    } catch {
      showToast('Could not add add-ons.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="page page-content">
      <div className="page-toolbar" style={{ justifyContent: 'space-between' }}>
        <div>
          <h1>Food Menu</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>Meals, categories, add-ons</p>
        </div>
        <Link href="/daily-close" className="btn btn-secondary" style={{ textDecoration: 'none', minHeight: 38, padding: '8px 12px' }}>
          Close Day
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="card" style={{ height: 118, opacity: 0.6 }} />
          <div className="row-card" style={{ opacity: 0.35 }} />
          <div className="row-card" style={{ opacity: 0.25 }} />
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <div className="card" style={{ padding: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Meals</p>
              <h2>{items.length}</h2>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Available</p>
              <h2>{availableCount}</h2>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>Avg price</p>
              <h2 style={{ fontSize: 16 }}>{money(avgPrice)}</h2>
            </div>
          </section>

          <section className="card" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <h2>Categories</h2>
              <form onSubmit={createCategory} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 6, flex: 1, maxWidth: 260 }}>
                <input className="input" placeholder="Rice, Drinks" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
                <button className="btn btn-secondary" disabled={saving || !categoryName.trim()}>Add</button>
              </form>
            </div>
            <div className="filter-chips">
              <button className={`btn btn-nowrap ${!activeCategory ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveCategory('')}>
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`btn btn-nowrap ${activeCategory === category.id ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => {
                    setActiveCategory(category.id);
                    setItemForm((current) => ({ ...current, categoryId: category.id }));
                  }}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
            <div className="card" style={panelStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <h2>Menu Board</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Tap meals in Food POS. Keep this list lean and easy to scan.</p>
                </div>
                <Link href="/food-pos" className="btn btn-primary" style={{ textDecoration: 'none', alignSelf: 'flex-start' }}>
                  Open POS
                </Link>
              </div>

              {groupedItems.groups.map(({ category, items: categoryItems }) => (
                categoryItems.length > 0 && (
                  <div key={category.id} style={{ display: 'grid', gap: 8 }}>
                    <h3>{category.name}</h3>
                    {categoryItems.map((item) => (
                      <div key={item.id} className="row-card" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 62 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong className="truncate-1" style={{ display: 'block' }}>{item.name}</strong>
                          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>
                            {item.prep_time_minutes ? `${item.prep_time_minutes} min` : 'No prep time'} · Cost {money(item.cost_price)}
                          </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                          <span className="pill pill-green">{money(item.price)}</span>
                          <button
                            className={`btn ${item.is_available === false ? 'btn-danger' : 'btn-ghost'}`}
                            style={{ padding: '3px 10px', fontSize: 11, minHeight: 'unset' }}
                            disabled={togglingId === item.id}
                            onClick={() => toggleAvailability(item)}
                          >
                            {item.is_available === false ? 'Hidden' : 'Available'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ))}

              {groupedItems.uncategorized.map((item) => (
                <div key={item.id} className="row-card" style={{ cursor: 'default', justifyContent: 'space-between', minHeight: 62 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <strong className="truncate-1" style={{ display: 'block' }}>{item.name}</strong>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>Uncategorized</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    <span className="pill pill-green">{money(item.price)}</span>
                    <button
                      className={`btn ${item.is_available === false ? 'btn-danger' : 'btn-ghost'}`}
                      style={{ padding: '3px 10px', fontSize: 11, minHeight: 'unset' }}
                      disabled={togglingId === item.id}
                      onClick={() => toggleAvailability(item)}
                    >
                      {item.is_available === false ? 'Hidden' : 'Available'}
                    </button>
                  </div>
                </div>
              ))}

              {items.length === 0 && (
                <div style={{ border: '1px dashed var(--border-strong)', borderRadius: 12, padding: 18, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Add your first meal from the setup panel.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              <form className="card" onSubmit={createMenuItem} style={panelStyle}>
                <h2>Quick Add Meal</h2>
                <label style={panelStyle}>
                  <span style={labelStyle}>Meal name</span>
                  <input className="input" placeholder="Waakye, Jollof, Fried rice" value={itemForm.name} onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={panelStyle}>
                    <span style={labelStyle}>Sell price</span>
                    <input className="input" type="number" min="0" step="0.01" value={itemForm.price} onChange={(e) => setItemForm((f) => ({ ...f, price: e.target.value }))} />
                  </label>
                  <label style={panelStyle}>
                    <span style={labelStyle}>Cost estimate</span>
                    <input className="input" type="number" min="0" step="0.01" value={itemForm.costPrice} onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))} />
                  </label>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={panelStyle}>
                    <span style={labelStyle}>Prep mins</span>
                    <input className="input" type="number" min="0" value={itemForm.prepTime} onChange={(e) => setItemForm((f) => ({ ...f, prepTime: e.target.value }))} />
                  </label>
                  <label style={panelStyle}>
                    <span style={labelStyle}>Opening qty</span>
                    <input className="input" type="number" min="0" value={itemForm.stockQty} onChange={(e) => setItemForm((f) => ({ ...f, stockQty: e.target.value }))} />
                  </label>
                </div>
                <label style={panelStyle}>
                  <span style={labelStyle}>Category</span>
                  <select className="input" value={itemForm.categoryId} onChange={(e) => setItemForm((f) => ({ ...f, categoryId: e.target.value }))}>
                    <option value="">No category</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                </label>
                <button className="btn btn-primary" disabled={saving || !itemForm.name.trim() || Number(itemForm.price) <= 0}>Save Meal</button>
              </form>

              <form className="card" onSubmit={createOption} style={panelStyle}>
                <h2>Add-ons</h2>
                <label style={panelStyle}>
                  <span style={labelStyle}>Meal</span>
                  <select className="input" value={optionForm.productId} onChange={(e) => setOptionForm((f) => ({ ...f, productId: e.target.value }))}>
                    <option value="">Choose meal</option>
                    {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label style={panelStyle}>
                  <span style={labelStyle}>Group</span>
                  <input className="input" placeholder="Extras, sides, protein" value={optionForm.name} onChange={(e) => setOptionForm((f) => ({ ...f, name: e.target.value }))} />
                </label>
                {optionForm.values.map((value, index) => (
                  <div key={index} style={{ display: 'grid', gridTemplateColumns: '1fr 94px', gap: 8 }}>
                    <input className="input" placeholder="Add egg" value={value.label} onChange={(e) => updateOptionValue(index, 'label', e.target.value)} />
                    <input className="input" type="number" min="0" step="0.01" placeholder="+0" value={value.price_delta} onChange={(e) => updateOptionValue(index, 'price_delta', e.target.value)} />
                  </div>
                ))}
                <button type="button" className="btn btn-secondary" onClick={() => setOptionForm((f) => ({ ...f, values: [...f.values, { label: '', price_delta: '' }] }))}>
                  Add Option
                </button>
                <button className="btn btn-primary" disabled={saving || !optionForm.productId || !optionForm.name.trim()}>Save Add-ons</button>
              </form>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
