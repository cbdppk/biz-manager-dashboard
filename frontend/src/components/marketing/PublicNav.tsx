'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAV_LINKS } from './marketing-data';

function LogoMark() {
  return (
    <span className="mkt-logo-mark" aria-hidden>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    </span>
  );
}

export default function PublicNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`mkt-nav${scrolled ? ' is-scrolled' : ''}`}>
      <Link href="/" className="mkt-logo">
        <LogoMark />
        <span className="mkt-logo-text">
          Biz<span>Manager</span>
        </span>
      </Link>

      <nav className="mkt-nav-links" aria-label="Main">
        {NAV_LINKS.map((link) => {
          const active = link.href === '/pricing' && pathname === '/pricing'
            || link.href === '/about' && pathname === '/about'
            || link.href === '/contact' && pathname === '/contact';
          return (
            <Link
              key={link.href}
              href={link.href}
              className={active ? 'is-active' : undefined}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="mkt-nav-actions">
        <Link href="/login" className="mkt-btn mkt-btn-ghost">Sign in</Link>
        <Link href="/register" className="mkt-btn mkt-btn-primary">Get started</Link>
      </div>
    </header>
  );
}
