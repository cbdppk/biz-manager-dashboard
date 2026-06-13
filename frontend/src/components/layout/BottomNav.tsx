'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredOperatingMode } from '@/lib/businessMode';

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.15 : 0} />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function SalesIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2.2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ProductsIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <path
        d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"
        fill={active ? 'currentColor' : 'none'}
        fillOpacity={active ? 0.12 : 0}
      />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? '2' : '1.8'} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} fillOpacity={active ? 0.25 : 0} />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const navItems = [
  { label: 'Home',     href: '/dashboard', icon: HomeIcon },
  { label: 'Sales',    href: '/sales',     icon: SalesIcon },
  { label: 'POS',      href: '/pos',       pos: true as const },
  { label: 'Products', href: '/products',  icon: ProductsIcon },
  { label: 'More',     href: '/settings',  icon: MoreIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [foodMode, setFoodMode] = useState(() => getStoredOperatingMode() === 'food');

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

  const computedNavItems = navItems.map((item) => {
    if (item.pos) return { ...item, href: foodMode ? '/food-pos' : '/pos' };
    if (foodMode && item.href === '/sales') return { ...item, label: 'Kitchen', href: '/orders' };
    if (foodMode && item.href === '/products') return { ...item, label: 'Groceries', href: '/products' };
    return item;
  });

  return (
    <nav className="bottom-nav">
      {computedNavItems.map(({ label, href, pos, icon: Icon }) => {
        const active =
          pathname === href ||
          (href !== '/dashboard' && pathname.startsWith(href + '/'));

        if (pos) {
          return (
            <div key={href} className="nav-item-pos">
              <Link href={href} style={{ textDecoration: 'none' }}>
                <button className="nav-pos-btn" aria-label="Open POS">
                  <PlusIcon />
                </button>
              </Link>
              <span style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--text-muted)',
                letterSpacing: '0.04em',
                marginTop: 3,
              }}>
                {foodMode ? 'Food' : 'POS'}
              </span>
            </div>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            className={`nav-item${active ? ' active' : ''}`}
          >
            {Icon && <Icon active={active} />}
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
