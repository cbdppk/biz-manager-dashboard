'use client';

import Link from 'next/link';

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaHref?: string;
  onCtaClick?: () => void;
};

export default function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  ctaHref,
  onCtaClick,
}: EmptyStateProps) {
  const cta = ctaLabel ? (
    ctaHref ? (
      <Link href={ctaHref} className="btn btn-primary" style={{ textDecoration: 'none' }}>
        {ctaLabel}
      </Link>
    ) : (
      <button className="btn btn-primary" onClick={onCtaClick}>
        {ctaLabel}
      </button>
    )
  ) : null;

  return (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '28px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
        }}
      >
        {icon}
      </div>
      <h2 style={{ fontSize: 18 }}>{title}</h2>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 320 }}>{description}</p>
      {cta}
    </div>
  );
}
