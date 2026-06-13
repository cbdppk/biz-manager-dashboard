import Link from 'next/link';

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mkt-footer">
      <div className="mkt-container mkt-footer-grid">
        <div>
          <Link href="/" className="mkt-logo" style={{ marginBottom: 14 }}>
            <span className="mkt-logo-mark" aria-hidden>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <span className="mkt-logo-text">
              Biz<span style={{ color: 'var(--accent)' }}>Manager</span>
            </span>
          </Link>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.65, maxWidth: 280 }}>
            The operating system for Ghanaian shops, restaurants, and growing SMEs — POS, stock, invoices, and AI in one place.
          </p>
        </div>

        <div>
          <h4>Product</h4>
          <Link href="/#features">Features</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="/register">Start free trial</Link>
          <Link href="/login">Sign in</Link>
        </div>

        <div>
          <h4>Company</h4>
          <Link href="/about">About us</Link>
          <Link href="/contact">Contact</Link>
        </div>

        <div>
          <h4>Legal</h4>
          <Link href="/privacy">Privacy policy</Link>
          <Link href="/terms">Terms of service</Link>
        </div>
      </div>

      <div className="mkt-container mkt-footer-bottom">
        <span>© {year} BizManager. Built for Ghanaian businesses.</span>
        <span>Accra · Kumasi · Nationwide</span>
      </div>
    </footer>
  );
}
