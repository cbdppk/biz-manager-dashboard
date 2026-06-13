'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { customersAPI } from '@/lib/api';
import { useToast } from '@/hooks/useToast';

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  total_unpaid_credit?: number | string | null;
}

type FilterTab = 'all' | 'owing' | 'clear';

const AVATAR_COLORS = ['#064e3b', '#1e3a5f', '#4c1d95', '#7c2d12', '#134e4a', '#1e1b4b'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return 'CU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function creditAmount(customer: Customer): number {
  const value = Number(customer.total_unpaid_credit ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return `GH₵ ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function normalizeCustomersPayload(raw: any): Customer[] {
  const customers = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.customers)
      ? raw.customers
      : [];

  return customers.map((customer: any) => ({
    id: String(customer.id),
    name: String(customer.name ?? 'Unnamed customer'),
    phone: customer.phone ?? null,
    total_unpaid_credit: customer.total_unpaid_credit ?? 0,
  }));
}

function Chevron() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function SearchIcon({ color = '#94a3b8' }: { color?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="row-card" style={{ cursor: 'default' }}>
      <div className="skeleton" style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className="skeleton" style={{ width: '55%', height: 14 }} />
        <div className="skeleton" style={{ width: '38%', height: 11 }} />
      </div>
      <div className="skeleton" style={{ width: 86, height: 24, borderRadius: 8 }} />
    </div>
  );
}

function SummaryItem({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'accent' | 'warn' | 'danger' | 'muted';
}) {
  const color = tone === 'accent'
    ? 'var(--accent)'
    : tone === 'warn'
      ? 'var(--warn)'
      : tone === 'danger'
        ? 'var(--danger)'
        : 'var(--text-primary)';

  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        borderRadius: 14,
        padding: '12px 10px',
      }}
    >
      <p className="section-label" style={{ margin: '0 0 6px', padding: 0 }}>{label}</p>
      <p style={{ margin: 0, color, fontWeight: 800, fontSize: value.length > 10 ? 17 : 20, lineHeight: 1.15, overflowWrap: 'anywhere' }}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  icon,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  icon: ReactNode;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '34px 18px', marginTop: 4 }}>
      {icon}
      <div>
        <p style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 800, margin: 0 }}>{title}</p>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '6px auto 0', maxWidth: 310 }}>
          {body}
        </p>
      </div>
      <button className="btn btn-primary" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const response = await customersAPI.list();
      setCustomers(normalizeCustomersPayload(response.data));
    } catch {
      setLoadError(true);
      setCustomers([]);
      showToast('Failed to load customers.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const summary = useMemo(() => {
    const owing = customers.filter((customer) => creditAmount(customer) > 0);
    const totalOutstanding = owing.reduce((sum, customer) => sum + creditAmount(customer), 0);

    return {
      total: customers.length,
      owing: owing.length,
      totalOutstanding,
      noCredit: customers.length - owing.length,
    };
  }, [customers]);

  const displayed = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return customers.filter((customer) => {
      const owed = creditAmount(customer);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'owing' && owed > 0) ||
        (filter === 'clear' && owed === 0);

      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const name = customer.name.toLowerCase();
      const phone = String(customer.phone ?? '').toLowerCase();
      return name.includes(normalizedQuery) || phone.includes(normalizedQuery);
    });
  }, [customers, filter, query]);

  function resetSearchAndFilter() {
    setQuery('');
    setFilter('all');
    setSearchOpen(false);
  }

  const emptyAllCustomers = !loading && !loadError && customers.length === 0;
  const emptyFiltered = !loading && !loadError && customers.length > 0 && displayed.length === 0;

  return (
    <main className="page page-content">
      <div className="page-toolbar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        {searchOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={searchInputRef}
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or phone..."
                style={{ paddingLeft: 42, paddingRight: query ? 42 : 14 }}
              />
              <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
                <SearchIcon />
              </div>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    display: 'flex',
                  }}
                  aria-label="Clear search"
                >
                  <CloseIcon />
                </button>
              )}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => { setSearchOpen(false); setQuery(''); }}
              style={{ paddingInline: 8 }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0 }}>Customers</h1>
              <p style={{ margin: '3px 0 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                Track credit, reminders, and repeat buyers.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setSearchOpen(true)}
                style={{ width: 42, height: 42, padding: 0 }}
                aria-label="Search customers"
              >
                <SearchIcon />
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => router.push('/customers/new')}
                style={{ width: 42, height: 42, padding: 0 }}
                aria-label="Add customer"
              >
                <PlusIcon />
              </button>
            </div>
          </div>
        )}
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
            <SummaryItem label="Total customers" value={String(summary.total)} tone="accent" />
            <SummaryItem label="Customers owing" value={String(summary.owing)} tone="warn" />
            <SummaryItem label="Outstanding credit" value={formatMoney(summary.totalOutstanding)} tone="danger" />
            <SummaryItem label="No credit" value={String(summary.noCredit)} tone="muted" />
          </div>
        </div>

        <div className="filter-chips">
          {[
            { id: 'all', label: 'All', count: summary.total },
            { id: 'owing', label: 'Owing', count: summary.owing },
            { id: 'clear', label: 'No Credit', count: summary.noCredit },
          ].map((tab) => {
            const active = filter === tab.id;

            return (
              <button
                key={tab.id}
                className={`btn ${active ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(tab.id as FilterTab)}
                style={{
                  minHeight: 38,
                  padding: '9px 13px',
                  boxShadow: active ? 'var(--shadow-accent)' : 'none',
                }}
              >
                {tab.label}
                <span
                  className={active ? 'pill' : 'pill pill-muted'}
                  style={active ? { background: 'rgba(255,255,255,0.18)', color: '#fff' } : undefined}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--row-gap)' }}>
          {loading && (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          )}

          {!loading && loadError && (
            <EmptyState
              title="Could not load customers"
              body="Check your connection and try again. Your customer records are safe."
              actionLabel="Retry"
              onAction={loadCustomers}
              icon={<UsersIcon />}
            />
          )}

          {emptyAllCustomers && (
            <EmptyState
              title="No customers yet"
              body="Add customers to track credit, repeat buyers, and payment reminders in one place."
              actionLabel="Add first customer"
              onAction={() => router.push('/customers/new')}
              icon={<UsersIcon />}
            />
          )}

          {emptyFiltered && (
            <EmptyState
              title="No matching customers"
              body="Try a different name or phone number, or clear the current credit filter."
              actionLabel="Clear search/filter"
              onAction={resetSearchAndFilter}
              icon={<UsersIcon />}
            />
          )}

          {!loading && !loadError && displayed.map((customer) => {
            const owed = creditAmount(customer);
            const owing = owed > 0;

            return (
              <div
                key={customer.id}
                className="row-card"
                onClick={() => router.push(`/customers/${customer.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    router.push(`/customers/${customer.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
                style={{
                  minHeight: 78,
                  borderColor: owing ? 'rgba(245,158,11,0.28)' : 'var(--border)',
                }}
              >
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: avatarColor(customer.name),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#fff',
                }}>
                  {initials(customer.name)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer.name}
                  </p>
                  <p style={{ fontSize: 13, color: customer.phone ? 'var(--text-secondary)' : 'var(--text-muted)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {customer.phone || 'No phone saved'}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, maxWidth: '45%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, minWidth: 0 }}>
                    <span className={`pill ${owing ? 'pill-warn' : 'pill-muted'}`}>
                      {owing ? 'Owing' : 'No credit'}
                    </span>
                    {owing && (
                      <span style={{ color: 'var(--warn)', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }}>
                        {formatMoney(owed)}
                      </span>
                    )}
                  </div>
                  <Chevron />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <button
        className="fab"
        onClick={() => router.push('/customers/new')}
        aria-label="Add customer"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </main>
  );
}
