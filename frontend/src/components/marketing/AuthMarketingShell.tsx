import Image from 'next/image';
import Link from 'next/link';
import { MARKETING_IMAGES } from './marketing-data';

export default function AuthMarketingShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mkt-auth-split" style={{ background: 'var(--bg-base)' }}>
      <aside className="mkt-auth-visual" aria-hidden={false}>
        <Image
          src={MARKETING_IMAGES.heroMarket}
          alt=""
          fill
          priority
          sizes="50vw"
        />
        <div className="mkt-auth-visual-overlay">
          <Link href="/" className="mkt-logo" style={{ marginBottom: 'auto', alignSelf: 'flex-start' }}>
            <span className="mkt-logo-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </span>
            <span className="mkt-logo-text">Biz<span>Manager</span></span>
          </Link>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
      </aside>
      <div className="mkt-auth-panel">{children}</div>
    </div>
  );
}
