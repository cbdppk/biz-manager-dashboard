import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '404 — Page not found',
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        background: 'var(--bg-base)',
        textAlign: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 32,
          marginBottom: 4,
        }}
      >
        404
      </div>

      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Page not found</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6, maxWidth: 280 }}>
          This page doesn&apos;t exist or was moved. Head back to the dashboard.
        </p>
      </div>

      <Link
        href="/dashboard"
        className="btn btn-primary"
        style={{ textDecoration: 'none', minWidth: 160 }}
      >
        Go to Dashboard
      </Link>
    </main>
  );
}
