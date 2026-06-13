'use client';

import { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api, { productsAPI } from '@/lib/api';
import EmptyState from '@/components/ui/EmptyState';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/hooks/useToast';
import { downloadCsv } from '@/lib/export';
import { getStoredOperatingMode } from '@/lib/businessMode';

interface Product {
  id: string;
  name: string;
  category?: string;
  stock_qty: number;
  reorder_level?: number;
  low_stock_threshold?: number;
  price: number;
  cost_price?: number | null;
  unit?: string | null;
}

const LOW_STOCK_THRESHOLD = 5;

function isLow(p: Product) {
  return p.stock_qty <= (p.low_stock_threshold ?? LOW_STOCK_THRESHOLD);
}

function fmt(n: number) {
  const amount = Number(n || 0);
  return `GH₵\u00a0${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function SkeletonRow() {
  return (
    <div className="row-card" style={{ opacity: 0.35 }}>
      <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="skeleton" style={{ width: '55%', height: 12, borderRadius: 4 }} />
        <div className="skeleton" style={{ width: '35%', height: 10, borderRadius: 4 }} />
      </div>
      <div className="skeleton" style={{ width: 52, height: 22, borderRadius: 6 }} />
    </div>
  );
}

function ProductsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [products, setProducts]     = useState<Product[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [foodMode, setFoodMode]     = useState(() => getStoredOperatingMode() === 'food');
  const [role, setRole]             = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery]           = useState('');
  const [filter, setFilter]         = useState<'all' | 'low_stock'>(
    searchParams.get('filter') === 'low_stock' ? 'low_stock' : 'all'
  );

  const fetchProducts = useCallback(async (q?: string, opts?: { silent?: boolean }) => {
    setLoading(true);
    setError('');
    const params: Record<string, string> = {};
    if (q) params.search = q;
    if (filter === 'low_stock') params.low_stock = 'true';
    if (foodMode) params.ingredients_only = 'true';
    try {
      const r = await productsAPI.list(params);
      setProducts(r.data?.products ?? r.data ?? []);
    } catch {
      setProducts([]);
      setError('Could not load products right now.');
      if (!opts?.silent) showToast('Could not refresh products.', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, foodMode]);

  const pullToRefresh = usePullToRefresh(async () => {
    await fetchProducts(query || undefined, { silent: true });
    showToast('Products refreshed.', 'success');
  });

  useEffect(() => {
    const t = setTimeout(() => fetchProducts(query || undefined), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [query, fetchProducts]);

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

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const displayed = filter === 'low_stock' && !query
    ? products.filter(isLow)
    : products;

  function exportProducts() {
    if (displayed.length === 0) { showToast('No products to export.', 'info'); return; }
    downloadCsv('bizmanager-products.csv', ['Name', 'Category', 'Stock Qty', 'Price'], displayed.map((p) => [
      p.name, p.category || '', p.stock_qty, Number(p.price).toFixed(2),
    ]));
    showToast('Products CSV downloaded.', 'success');
  }

  const lowCount = products.filter(isLow).length;
  const canManageProducts = role === 'owner' || role === 'manager';
  const totalCostValue = products.reduce((sum, product) => sum + (Number(product.cost_price || 0) * Number(product.stock_qty || 0)), 0);
  const totalRetailValue = products.reduce((sum, product) => sum + (Number(product.price || 0) * Number(product.stock_qty || 0)), 0);
  const missingCostCount = products.filter((product) => !Number(product.cost_price || 0)).length;

  return (
    <main className="page page-content">
      <PullToRefreshIndicator {...pullToRefresh} />

      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: '20px var(--page-pad) 0',
        borderBottom: searchOpen ? '1px solid var(--border)' : 'none',
      }}>
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 14 }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-input)',
              border: '1.5px solid var(--accent)',
              borderRadius: 12, padding: '0 12px', height: 44,
              boxShadow: '0 0 0 3px var(--accent-glow)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products…"
                style={{
                  flex: 1, background: 'none', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit',
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: 'var(--text-muted)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <button
              onClick={() => { setSearchOpen(false); setQuery(''); }}
              style={{
                background: 'none', border: 'none',
                color: 'var(--accent)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.4px' }}>{foodMode ? 'Groceries' : 'Products'}</h1>
                {!loading && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 1 }}>
                    {foodMode ? `${products.length} ingredient${products.length !== 1 ? 's' : ''}` : `${products.length} item${products.length !== 1 ? 's' : ''}`}
                    {lowCount > 0 && (
                      <span style={{ color: 'var(--warn)', marginLeft: 6 }}>· {lowCount} low</span>
                    )}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  onClick={exportProducts}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  aria-label="Export products"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </button>
                <button
                  onClick={() => setSearchOpen(true)}
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary)', cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                  aria-label="Search products"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="filter-chips" style={{ marginBottom: 14 }}>
              {(['all', 'low_stock'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    border: filter === f ? 'none' : '1px solid var(--border)',
                    background: filter === f ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: filter === f ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 150ms',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {f === 'all' ? (foodMode ? 'All Groceries' : 'All Products') : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      Low Stock
                      {lowCount > 0 && (
                        <span style={{
                          background: filter === 'low_stock' ? 'rgba(255,255,255,0.25)' : 'var(--warn-dim)',
                          color: filter === 'low_stock' ? '#fff' : 'var(--warn)',
                          borderRadius: 10, padding: '0 6px', fontSize: 11, fontWeight: 700,
                        }}>
                          {lowCount}
                        </span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Product list ────────────────────────────────── */}
      <div style={{ padding: '12px var(--page-pad)', display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
        {!loading && !error && (
          <section className="card" style={{ display: 'grid', gap: 12, marginBottom: 8 }}>
            <div className="summary-grid">
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Total items</p>
                <strong style={{ fontSize: 17 }}>{products.length}</strong>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Low stock</p>
                <strong style={{ fontSize: 17, color: lowCount ? 'var(--warn)' : 'var(--accent)' }}>{lowCount}</strong>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Retail value</p>
                <strong style={{ fontSize: 17 }}>{fmt(totalRetailValue)}</strong>
              </div>
              <div>
                <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 800 }}>Cost value</p>
                <strong style={{ fontSize: 17, color: missingCostCount ? 'var(--warn)' : 'var(--text-primary)' }}>
                  {fmt(totalCostValue)}
                </strong>
                {missingCostCount > 0 && (
                  <p style={{ color: 'var(--warn)', fontSize: 11, marginTop: 2 }}>{missingCostCount} missing cost</p>
                )}
              </div>
            </div>
            {foodMode && (
              <div style={{ display: 'grid', gridTemplateColumns: canManageProducts ? '1fr 1fr' : '1fr', gap: 8 }}>
                {canManageProducts && (
                  <Link href="/products/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>Add Grocery</Link>
                )}
                <Link href="/daily-close" className="btn btn-secondary" style={{ textDecoration: 'none' }}>Close Day</Link>
              </div>
            )}
            {!foodMode && canManageProducts && (
              <Link href="/products/new" className="btn btn-primary" style={{ textDecoration: 'none' }}>
                Add Product
              </Link>
            )}
          </section>
        )}

        {error && !loading && (
          <div className="card" style={{ marginBottom: 4 }}>
            <p style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 13 }}>{error}</p>
            <button className="btn btn-secondary" style={{ fontSize: 13, padding: '10px 16px' }} onClick={() => fetchProducts(query || undefined)}>
              Try Again
            </button>
          </div>
        )}

        {loading
          ? Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
          : displayed.length === 0
          ? (
            query ? (
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>}
                title={foodMode ? 'No matching groceries' : 'No matching products'}
                description={foodMode ? 'Try another ingredient name or clear the search.' : 'Try a different name or clear the search to see all items.'}
              />
            ) : filter === 'low_stock' ? (
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 6v6l4 2" /><circle cx="12" cy="12" r="9" /></svg>}
                title="All stock levels healthy"
                description={foodMode ? 'No ingredients below their reorder threshold right now.' : 'No products below their reorder threshold right now.'}
                ctaLabel={foodMode ? 'View all groceries' : 'View all products'}
                onCtaClick={() => setFilter('all')}
              />
            ) : (
              <EmptyState
                icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>}
                title={foodMode ? 'No groceries yet' : 'No products yet'}
                description={foodMode ? 'Add ingredients like rice, oil, eggs, chicken, bags, and spices so production costs are visible.' : 'Add your first product to start tracking inventory and sales.'}
                ctaLabel={canManageProducts ? (foodMode ? 'Add first grocery' : 'Add first product') : undefined}
                ctaHref={canManageProducts ? '/products/new' : undefined}
              />
            )
          )
          : displayed.map((p) => (
            <Link key={p.id} href={`/products/${p.id}`} style={{ textDecoration: 'none' }}>
              <div className="row-card">
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: isLow(p) ? 'var(--warn-dim)' : 'var(--bg-elevated)',
                  border: `1px solid ${isLow(p) ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700,
                  color: isLow(p) ? 'var(--warn)' : 'var(--text-secondary)',
                  textTransform: 'uppercase',
                }}>
                  {p.name.slice(0, 2)}
                </div>

                {/* Name + category */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }} className="truncate-1">
                    {p.name}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, marginTop: 1 }}>
                    {foodMode
                      ? `${p.category || 'Ingredient'} · ${p.stock_qty} ${p.unit || 'units'} · Cost ${fmt(Number(p.cost_price || 0))}`
                      : `${p.category || p.unit || 'Product'} · ${p.stock_qty} in stock · Reorder ${p.reorder_level ?? p.low_stock_threshold ?? LOW_STOCK_THRESHOLD}`}
                  </p>
                </div>

                {/* Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span className={isLow(p) ? 'pill pill-warn' : 'pill pill-muted'}>
                    {p.stock_qty} left
                  </span>
                  <span className="pill pill-green">{fmt(foodMode ? Number(p.cost_price || p.price || 0) : p.price)}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            </Link>
          ))
        }
      </div>

      {/* ── FAB ─────────────────────────────────────────── */}
      {canManageProducts && (
        <button
          onClick={() => router.push('/products/new')}
          className="fab"
          aria-label="Add product"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      )}
    </main>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<main className="page page-content"><div className="skeleton skeleton-card" /></main>}>
      <ProductsPageInner />
    </Suspense>
  );
}
