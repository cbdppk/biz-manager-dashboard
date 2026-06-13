'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api, { productsAPI } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/hooks/useToast';
import { getPathSegment } from '@/lib/pathnameParams';
import { getStoredOperatingMode } from '@/lib/businessMode';

type ProductRecord = {
  id: string;
  name?: string | null;
  sku?: string | null;
  category?: string | null;
  price?: number | string | null;
  selling_price?: number | string | null;
  cost_price?: number | string | null;
  stock_qty?: number | string | null;
  reorder_level?: number | string | null;
  unit?: string | null;
  needs_restock?: boolean | null;
};

type StockMovement = {
  id: string;
  movement_type?: string | null;
  quantity_change?: number | string | null;
  quantity_before?: number | string | null;
  quantity_after?: number | string | null;
  note?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  created_at?: string | null;
};

type ActiveForm = 'restock' | 'adjust' | 'edit' | null;

type ProductForm = {
  name: string;
  sku: string;
  category: string;
  price: string;
  cost_price: string;
  reorder_level: string;
  unit: string;
};

const UNITS = ['piece', 'kg', 'litre', 'box', 'pack', 'dozen'];

function safeNumber(value: unknown, fallback = 0) {
  const amount = Number(value ?? fallback);
  return Number.isFinite(amount) ? amount : fallback;
}

function formatMoney(value: unknown) {
  return `GH₵ ${safeNumber(value).toFixed(2)}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';

  return parsed.toLocaleString('en-GH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortId(id: string | null | undefined) {
  if (!id) return '—';
  return id.slice(-6).toUpperCase();
}

function normalizeProductPayload(raw: any): ProductRecord | null {
  const product = raw?.product ?? raw ?? null;
  if (!product?.id) return null;

  return {
    id: String(product.id),
    name: product.name || 'Unnamed product',
    sku: product.sku || null,
    category: product.category || null,
    price: product.price ?? product.selling_price ?? 0,
    selling_price: product.selling_price ?? product.price ?? 0,
    cost_price: product.cost_price ?? null,
    stock_qty: product.stock_qty ?? 0,
    reorder_level: product.reorder_level ?? 5,
    unit: product.unit || 'piece',
    needs_restock: product.needs_restock ?? null,
  };
}

function normalizeMovementsPayload(raw: any): StockMovement[] {
  const movements = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.movements)
      ? raw.movements
      : [];

  return movements.map((movement: any, index: number) => ({
    id: String(movement.id ?? `${movement.product_id ?? 'movement'}-${movement.created_at ?? index}`),
    movement_type: movement.movement_type || movement.type || 'other',
    quantity_change: movement.quantity_change ?? 0,
    quantity_before: movement.quantity_before ?? 0,
    quantity_after: movement.quantity_after ?? 0,
    note: movement.note || null,
    reference_type: movement.reference_type || null,
    reference_id: movement.reference_id || null,
    created_at: movement.created_at || null,
  }));
}

function stockStatus(product: ProductRecord) {
  const stock = safeNumber(product.stock_qty);
  const reorder = safeNumber(product.reorder_level, 5);

  if (stock <= 0) return { label: 'Out of Stock', tone: 'danger' as const };
  if (stock <= reorder) return { label: 'Low Stock', tone: 'warn' as const };
  return { label: 'In Stock', tone: 'green' as const };
}

function movementLabel(type: string | null | undefined) {
  const normalized = String(type || '').toLowerCase();
  if (normalized === 'initial') return 'Initial';
  if (normalized === 'restock') return 'Restock';
  if (normalized === 'adjustment') return 'Adjustment';
  if (normalized === 'sale') return 'Sale / Sold';
  return 'Other';
}

function movementPillClass(quantity: number) {
  if (quantity > 0) return 'pill pill-green';
  if (quantity < 0) return 'pill pill-danger';
  return 'pill pill-muted';
}

function SummaryCard({ label, value, tone = 'default', helper }: { label: string; value: string; tone?: 'default' | 'green' | 'warn' | 'danger'; helper?: string }) {
  const color = tone === 'green'
    ? 'var(--accent)'
    : tone === 'warn'
      ? 'var(--warn)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-primary)';

  return (
    <div className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', padding: 14 }}>
      <div style={{ minWidth: 0 }}>
        <p className="section-label" style={{ margin: '0 0 6px', padding: 0 }}>{label}</p>
        <p style={{ margin: 0, color, fontWeight: 800, fontSize: value.length > 12 ? 16 : 19, overflowWrap: 'anywhere' }}>
          {value}
        </p>
        {helper && <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>{helper}</p>}
      </div>
    </div>
  );
}

function InlineError({ title, body, onRetry }: { title: string; body: string; onRetry: () => void }) {
  return (
    <div className="row-card" style={{ cursor: 'default', borderColor: 'rgba(239,68,68,0.24)', alignItems: 'flex-start', paddingBlock: 14 }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px', color: 'var(--danger)', fontWeight: 800 }}>{title}</p>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{body}</p>
      </div>
      <button className="btn btn-secondary" onClick={onRetry} style={{ padding: '9px 12px' }}>
        Retry
      </button>
    </div>
  );
}

function EmptyRow({ title, body }: { title: string; body: string }) {
  return (
    <div className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 14 }}>
      <div>
        <p style={{ margin: '0 0 4px', fontWeight: 800 }}>{title}</p>
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{body}</p>
      </div>
    </div>
  );
}

export default function ProductDetailPage() {
  const router = useRouter();
  const pathname = usePathname();
  const id = getPathSegment(pathname);
  const { showToast } = useToast();

  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [productLoadError, setProductLoadError] = useState(false);
  const [movementLoadError, setMovementLoadError] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [foodMode, setFoodMode] = useState(() => getStoredOperatingMode() === 'food');
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockNote, setRestockNote] = useState('');
  const [restockError, setRestockError] = useState('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [adjustError, setAdjustError] = useState('');
  const [savingRestock, setSavingRestock] = useState(false);
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [productForm, setProductForm] = useState<ProductForm>({
    name: '',
    sku: '',
    category: '',
    price: '',
    cost_price: '',
    reorder_level: '5',
    unit: 'piece',
  });
  const [productFormError, setProductFormError] = useState('');

  const applyProduct = useCallback((nextProduct: ProductRecord) => {
    setProduct(nextProduct);
    setProductForm({
      name: nextProduct.name || '',
      sku: nextProduct.sku || '',
      category: nextProduct.category || '',
      price: String(nextProduct.price ?? ''),
      cost_price: nextProduct.cost_price == null ? '' : String(nextProduct.cost_price),
      reorder_level: String(nextProduct.reorder_level ?? 5),
      unit: nextProduct.unit || 'piece',
    });
  }, []);

  const loadProduct = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setProductLoadError(false);
    setMovementLoadError(false);

    const [productResult, movementResult] = await Promise.allSettled([
      productsAPI.get(id),
      productsAPI.stockMovements(id),
    ]);

    if (productResult.status === 'fulfilled') {
      const nextProduct = normalizeProductPayload(productResult.value.data);
      if (nextProduct) {
        applyProduct(nextProduct);
      } else {
        setProduct(null);
        setProductLoadError(true);
      }
    } else {
      setProduct(null);
      setProductLoadError(true);
      showToast('Failed to load product.', 'error');
    }

    if (movementResult.status === 'fulfilled') {
      setMovements(normalizeMovementsPayload(movementResult.value.data));
    } else {
      setMovements([]);
      setMovementLoadError(true);
    }

    setLoading(false);
  }, [applyProduct, id, showToast]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    let cancelled = false;
    api.get('/auth/me')
      .then((res) => {
        if (!cancelled) setRole(res.data?.user?.role ?? '');
      })
      .catch(() => {
        if (!cancelled) setRole('');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const syncMode = () => setFoodMode(getStoredOperatingMode() === 'food');
    syncMode();
    window.addEventListener('bm:operating-mode', syncMode);
    window.addEventListener('storage', syncMode);
    window.addEventListener('pageshow', syncMode);
    return () => {
      window.removeEventListener('bm:operating-mode', syncMode);
      window.removeEventListener('storage', syncMode);
      window.removeEventListener('pageshow', syncMode);
    };
  }, []);

  const canManageProducts = role === 'owner' || role === 'manager';
  const stock = safeNumber(product?.stock_qty);
  const reorder = safeNumber(product?.reorder_level, 5);
  const price = safeNumber(product?.price ?? product?.selling_price);
  const cost = product?.cost_price == null ? null : safeNumber(product.cost_price);
  const retailValue = stock * price;
  const costValue = cost == null ? 0 : stock * cost;
  const potentialProfit = cost == null ? 0 : retailValue - costValue;
  const status = product ? stockStatus(product) : { label: '—', tone: 'default' as const };
  const busy = savingRestock || savingAdjust || savingProduct || archiving;

  const pageTitle = foodMode ? 'Grocery Details' : 'Product Details';

  function openForm(form: ActiveForm) {
    setActiveForm((current) => current === form ? null : form);
    setRestockError('');
    setAdjustError('');
    setProductFormError('');
    if (form === 'restock') {
      setRestockQty('');
      setRestockNote('');
    }
    if (form === 'adjust') {
      setAdjustQty(String(stock));
      setAdjustNote('');
    }
  }

  async function reloadAfterMutation() {
    if (!id) return;
    const [productResult, movementResult] = await Promise.allSettled([
      productsAPI.get(id),
      productsAPI.stockMovements(id),
    ]);

    if (productResult.status === 'fulfilled') {
      const nextProduct = normalizeProductPayload(productResult.value.data);
      if (nextProduct) applyProduct(nextProduct);
    }

    if (movementResult.status === 'fulfilled') {
      setMovements(normalizeMovementsPayload(movementResult.value.data));
      setMovementLoadError(false);
    } else {
      setMovementLoadError(true);
    }
  }

  async function handleRestock() {
    if (!id || savingRestock) return;

    if (!restockQty.trim()) {
      setRestockError('Quantity is required.');
      return;
    }

    const quantity = Number(restockQty);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setRestockError('Quantity must be a whole number greater than 0.');
      return;
    }

    setSavingRestock(true);
    setRestockError('');
    try {
      await productsAPI.restock(id, {
        quantity,
        note: restockNote.trim() || undefined,
      });
      await reloadAfterMutation();
      setRestockQty('');
      setRestockNote('');
      setActiveForm(null);
      showToast('Product restocked.', 'success');
    } catch {
      showToast('Failed to restock product.', 'error');
    } finally {
      setSavingRestock(false);
    }
  }

  async function handleAdjustStock() {
    if (!id || savingAdjust) return;

    if (!adjustQty.trim()) {
      setAdjustError('New stock quantity is required.');
      return;
    }

    const nextStock = Number(adjustQty);
    if (!Number.isInteger(nextStock) || nextStock < 0) {
      setAdjustError('New stock quantity must be a whole number of 0 or more.');
      return;
    }

    if (!adjustNote.trim()) {
      setAdjustError('Reason for adjustment is required.');
      return;
    }

    setSavingAdjust(true);
    setAdjustError('');
    try {
      await productsAPI.update(id, {
        stock_qty: nextStock,
        stock_adjustment_note: adjustNote.trim(),
      });
      await reloadAfterMutation();
      setAdjustQty('');
      setAdjustNote('');
      setActiveForm(null);
      showToast('Stock count corrected.', 'success');
    } catch {
      showToast('Failed to adjust stock.', 'error');
    } finally {
      setSavingAdjust(false);
    }
  }

  async function handleSaveProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!id || savingProduct) return;

    const sellingPrice = Number(productForm.price);
    const reorderLevel = Number(productForm.reorder_level);
    const nextCost = productForm.cost_price.trim() ? Number(productForm.cost_price) : null;

    if (!productForm.name.trim()) {
      setProductFormError('Product name is required.');
      return;
    }
    if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
      setProductFormError('Enter a valid selling price.');
      return;
    }
    if (nextCost != null && (!Number.isFinite(nextCost) || nextCost < 0)) {
      setProductFormError('Cost price cannot be negative.');
      return;
    }
    if (!Number.isInteger(reorderLevel) || reorderLevel < 0) {
      setProductFormError('Reorder level must be a whole number of 0 or more.');
      return;
    }

    setSavingProduct(true);
    setProductFormError('');
    try {
      await productsAPI.update(id, {
        name: productForm.name.trim(),
        sku: productForm.sku.trim() || null,
        category: productForm.category.trim() || null,
        price: sellingPrice,
        cost_price: nextCost,
        reorder_level: reorderLevel,
        unit: productForm.unit,
      });
      await reloadAfterMutation();
      setActiveForm(null);
      showToast('Product updated.', 'success');
    } catch {
      showToast('Failed to update product.', 'error');
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleArchiveProduct() {
    if (!id || archiving) return;

    setArchiving(true);
    try {
      await productsAPI.delete(id);
      showToast('Product archived.', 'success');
      router.push('/products');
    } catch {
      showToast('Failed to archive product.', 'error');
      setArchiving(false);
      setShowArchiveConfirm(false);
    }
  }

  if (loading) {
    return (
      <main className="page page-content">
        <div className="card" style={{ display: 'grid', gap: 16, marginBottom: 14 }}>
          <div className="skeleton" style={{ width: 180, height: 24, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 130, borderRadius: 14 }} />
        </div>
        <div className="card" style={{ display: 'grid', gap: 12 }}>
          <div className="skeleton" style={{ width: 180, height: 18, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 72, borderRadius: 14 }} />
          <div className="skeleton" style={{ width: '100%', height: 72, borderRadius: 14 }} />
        </div>
      </main>
    );
  }

  if (!product || productLoadError) {
    return (
      <main className="page page-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="card" style={{ textAlign: 'center', maxWidth: 380 }}>
          <h1 style={{ marginBottom: 8 }}>Could not load product</h1>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 14 }}>
            This product could not be opened. Check your connection and try again.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={loadProduct}>Retry</button>
            <button className="btn btn-secondary" onClick={() => router.push('/products')}>Back to Products</button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="page page-content">
      <div className="page-toolbar">
        <button
          onClick={() => router.push('/products')}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-primary)', display: 'flex', cursor: 'pointer' }}
          aria-label="Back to products"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="truncate-1" style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{pageTitle}</h1>
          <p style={{ margin: '3px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
            Stock record #{shortId(product.id)}
          </p>
        </div>
      </div>

      <section className="card" style={{ display: 'grid', gap: 16, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <p className="section-label" style={{ margin: '0 0 6px', padding: 0 }}>
              {product.category || (foodMode ? 'Production grocery' : 'Inventory item')}
            </p>
            <h2 style={{ margin: 0, fontSize: 23, fontWeight: 800, letterSpacing: '-0.3px' }}>{product.name || 'Unnamed product'}</h2>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
              {product.sku ? `SKU ${product.sku}` : 'No SKU yet'} · {product.unit || 'piece'}
            </p>
          </div>
          <span className={`pill ${status.tone === 'danger' ? 'pill-danger' : status.tone === 'warn' ? 'pill-warn' : 'pill-green'}`}>
            {status.label}
          </span>
        </div>

        {status.tone !== 'green' && (
          <div className="row-card" style={{ cursor: 'default', borderColor: status.tone === 'danger' ? 'rgba(239,68,68,0.32)' : 'rgba(245,158,11,0.32)', alignItems: 'flex-start', paddingBlock: 14 }}>
            <div style={{ flex: 1 }}>
              <p style={{ margin: '0 0 4px', fontWeight: 800, color: status.tone === 'danger' ? 'var(--danger)' : 'var(--warn)' }}>
                {status.tone === 'danger' ? 'Out of stock' : 'Low stock warning'}
              </p>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                {status.tone === 'danger'
                  ? 'This product cannot be sold until it is restocked.'
                  : 'This product is at or below its reorder level.'}
              </p>
            </div>
            {canManageProducts && (
              <button className="btn btn-primary" onClick={() => openForm('restock')} disabled={busy} style={{ padding: '10px 12px' }}>
                Restock now
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <SummaryCard label="Current Stock" value={`${stock} ${product.unit || 'units'}`} tone={status.tone === 'danger' ? 'danger' : status.tone === 'warn' ? 'warn' : 'green'} />
          <SummaryCard label="Reorder Level" value={`${reorder} ${product.unit || 'units'}`} />
          <SummaryCard label="Selling Price" value={formatMoney(price)} />
          <SummaryCard label="Cost Price" value={cost == null ? '—' : formatMoney(cost)} helper={cost == null ? 'Add cost price to calculate profit accurately.' : undefined} />
          <SummaryCard label="Stock Retail Value" value={formatMoney(retailValue)} />
          <SummaryCard label="Stock Cost Value" value={cost == null ? '—' : formatMoney(costValue)} />
          <SummaryCard label="Potential Gross Profit" value={cost == null ? '—' : formatMoney(potentialProfit)} tone={cost != null && potentialProfit >= 0 ? 'green' : cost != null ? 'danger' : 'default'} />
        </div>

        {canManageProducts && (
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => openForm('restock')} disabled={busy}>
              Restock
            </button>
            <button className="btn btn-secondary" onClick={() => openForm('adjust')} disabled={busy}>
              Adjust Stock
            </button>
            <button className="btn btn-secondary" onClick={() => openForm('edit')} disabled={busy}>
              Edit Product
            </button>
            <button className="btn btn-danger" onClick={() => setShowArchiveConfirm(true)} disabled={busy}>
              {archiving ? 'Archiving…' : 'Archive Product'}
            </button>
          </div>
        )}

        {activeForm === 'restock' && (
          <div className="card" style={{ padding: 16 }}>
            <p className="section-label" style={{ marginTop: 0 }}>Restock</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <div>
                <label className="input-label">Quantity to add</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={restockQty}
                  onChange={(event) => {
                    setRestockQty(event.target.value);
                    if (restockError) setRestockError('');
                  }}
                  placeholder="e.g. 10"
                  style={{ borderColor: restockError ? 'var(--danger)' : undefined }}
                  disabled={savingRestock}
                />
                {restockError && <p style={{ margin: '6px 0 0', color: 'var(--danger)', fontSize: 12 }}>{restockError}</p>}
              </div>
              <div>
                <label className="input-label">Note</label>
                <input
                  className="input"
                  value={restockNote}
                  onChange={(event) => setRestockNote(event.target.value)}
                  placeholder="Supplier delivery, market purchase..."
                  disabled={savingRestock}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setActiveForm(null)} disabled={savingRestock}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={handleRestock} disabled={savingRestock}>
                  {savingRestock ? 'Saving…' : 'Save Restock'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeForm === 'adjust' && (
          <div className="card" style={{ padding: 16 }}>
            <p className="section-label" style={{ marginTop: 0 }}>Correct Stock Count</p>
            <div style={{ display: 'grid', gap: 12 }}>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Current stock: {stock} {product.unit || 'units'}
              </p>
              <div>
                <label className="input-label">New stock quantity</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={adjustQty}
                  onChange={(event) => {
                    setAdjustQty(event.target.value);
                    if (adjustError) setAdjustError('');
                  }}
                  placeholder="e.g. 15"
                  style={{ borderColor: adjustError ? 'var(--danger)' : undefined }}
                  disabled={savingAdjust}
                />
              </div>
              <div>
                <label className="input-label">Reason for adjustment</label>
                <input
                  className="input"
                  value={adjustNote}
                  onChange={(event) => {
                    setAdjustNote(event.target.value);
                    if (adjustError) setAdjustError('');
                  }}
                  placeholder="Physical count correction, damaged stock..."
                  disabled={savingAdjust}
                />
                {adjustError && <p style={{ margin: '6px 0 0', color: 'var(--danger)', fontSize: 12 }}>{adjustError}</p>}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" type="button" onClick={() => setActiveForm(null)} disabled={savingAdjust}>Cancel</button>
                <button className="btn btn-primary" type="button" onClick={handleAdjustStock} disabled={savingAdjust}>
                  {savingAdjust ? 'Saving…' : 'Save Adjustment'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeForm === 'edit' && (
          <form className="card" onSubmit={handleSaveProduct} style={{ padding: 16, display: 'grid', gap: 12 }}>
            <p className="section-label" style={{ marginTop: 0 }}>Edit Product</p>
            <div>
              <label className="input-label">Product name</label>
              <input className="input" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} disabled={savingProduct} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <label className="input-label">SKU</label>
                <input className="input" value={productForm.sku} onChange={(event) => setProductForm((current) => ({ ...current, sku: event.target.value }))} disabled={savingProduct} />
              </div>
              <div>
                <label className="input-label">Category</label>
                <input className="input" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} disabled={savingProduct} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <label className="input-label">Selling Price</label>
                <input className="input" type="number" min="0" step="0.01" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} disabled={savingProduct} />
              </div>
              <div>
                <label className="input-label">Cost Price</label>
                <input className="input" type="number" min="0" step="0.01" value={productForm.cost_price} onChange={(event) => setProductForm((current) => ({ ...current, cost_price: event.target.value }))} disabled={savingProduct} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
              <div>
                <label className="input-label">Reorder Level</label>
                <input className="input" type="number" min="0" step="1" value={productForm.reorder_level} onChange={(event) => setProductForm((current) => ({ ...current, reorder_level: event.target.value }))} disabled={savingProduct} />
              </div>
              <div>
                <label className="input-label">Unit</label>
                <select className="input" value={productForm.unit} onChange={(event) => setProductForm((current) => ({ ...current, unit: event.target.value }))} disabled={savingProduct}>
                  {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </div>
            </div>
            {productFormError && <p style={{ margin: 0, color: 'var(--danger)', fontSize: 12 }}>{productFormError}</p>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" type="button" onClick={() => setActiveForm(null)} disabled={savingProduct}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={savingProduct}>{savingProduct ? 'Saving…' : 'Save Product'}</button>
            </div>
          </form>
        )}
      </section>

      <section className="card">
        <p className="section-label" style={{ marginTop: 0 }}>Stock Movement History</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {movementLoadError && (
            <InlineError
              title="Could not load stock movements"
              body="The product details loaded, but movement history is temporarily unavailable."
              onRetry={loadProduct}
            />
          )}

          {!movementLoadError && movements.length === 0 && (
            <EmptyRow
              title="No stock movements yet."
              body="Opening stock, restocks, sales, and adjustments will appear here."
            />
          )}

          {!movementLoadError && movements.map((movement) => {
            const qty = safeNumber(movement.quantity_change);
            const before = safeNumber(movement.quantity_before);
            const after = safeNumber(movement.quantity_after);
            const sign = qty > 0 ? '+' : qty < 0 ? '-' : '';

            return (
              <div key={movement.id} className="row-card" style={{ cursor: 'default', alignItems: 'flex-start', paddingBlock: 14 }}>
                <span className={movementPillClass(qty)} style={{ minWidth: 54 }}>
                  {sign} {Math.abs(qty)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <p style={{ margin: 0, fontWeight: 800 }}>{movementLabel(movement.movement_type)}</p>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>{formatDateTime(movement.created_at)}</p>
                  </div>
                  <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)' }}>
                    {before} → {after} {product.unit || 'units'}
                  </p>
                  <p style={{ margin: '5px 0 0', color: movement.note ? 'var(--text-secondary)' : 'var(--text-muted)', fontSize: 13 }}>
                    {movement.note || 'No note provided'}
                  </p>
                  {movement.reference_type && (
                    <p style={{ margin: '5px 0 0', color: 'var(--text-muted)', fontSize: 12 }}>
                      Ref: {movement.reference_type}{movement.reference_id ? ` #${shortId(movement.reference_id)}` : ''}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ConfirmDialog
        open={showArchiveConfirm}
        title="Archive product?"
        message="This product will be removed from active product lists. Existing sales and stock records will stay intact."
        confirmLabel="Archive"
        tone="danger"
        busy={archiving}
        onConfirm={handleArchiveProduct}
        onCancel={() => setShowArchiveConfirm(false)}
      />
    </main>
  );
}
