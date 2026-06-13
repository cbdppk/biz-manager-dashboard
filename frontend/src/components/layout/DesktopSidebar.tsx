'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredOperatingMode } from '@/lib/businessMode';

interface NavItem {
  label: string;
  href: string;
  match?: (pathname: string, href: string) => boolean;
}

const BASE_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Sales', href: '/sales' },
  { label: 'POS', href: '/pos' },
  { label: 'Products', href: '/products' },
  { label: 'Customers', href: '/customers' },
  { label: 'Invoices', href: '/invoices' },
  { label: 'Expenses', href: '/expenses' },
  { label: 'Reports', href: '/reports' },
  { label: 'Settings', href: '/settings' },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(`${href}/`));
}

export default function DesktopSidebar() {
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

  const items = BASE_ITEMS.map((item) => {
    if (item.href === '/pos') return { ...item, href: foodMode ? '/food-pos' : '/pos', label: foodMode ? 'Food POS' : 'POS' };
    if (foodMode && item.href === '/sales') return { ...item, label: 'Kitchen', href: '/orders' };
    if (foodMode && item.href === '/products') return { ...item, label: 'Groceries' };
    return item;
  });

  if (foodMode) {
    items.splice(4, 0, { label: 'Menu', href: '/menu' });
  }

  return (
    <aside className="desktop-sidebar" aria-label="Main navigation">
      <div className="desktop-sidebar-brand">
        <span className="desktop-sidebar-logo">TB</span>
        <div>
          <p className="desktop-sidebar-title">BizManager</p>
          <p className="desktop-sidebar-subtitle">Business manager</p>
        </div>
      </div>
      <nav className="desktop-sidebar-nav">
        {items.map(({ label, href }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={`${href}-${label}`}
              href={href}
              className={`desktop-sidebar-link${active ? ' active' : ''}`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
