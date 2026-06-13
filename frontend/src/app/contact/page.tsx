import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import MarketingShell from '@/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the BizManager team for sales, support, and partnerships.',
};

export default function ContactPage() {
  return (
    <MarketingShell>
      <section className="mkt-page-hero">
        <div className="mkt-container mkt-reveal is-visible">
          <p className="mkt-kicker">Contact</p>
          <h1>We&apos;re here to help you get started</h1>
          <p>
            Questions about setup, billing, or migrating from your current tools? Reach out — we typically respond within one business day.
          </p>
        </div>
      </section>

      <section className="mkt-container mkt-contact-grid">
        <article className="mkt-contact-card mkt-reveal" style={{ '--mkt-delay': '0ms' } as CSSProperties}>
          <h3>Sales & onboarding</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65, marginBottom: 12 }}>
            New business setup, team training, and plan recommendations.
          </p>
          <a href="mailto:hello@example.com">hello@example.com</a>
        </article>

        <article className="mkt-contact-card mkt-reveal" style={{ '--mkt-delay': '70ms' } as CSSProperties}>
          <h3>Customer support</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65, marginBottom: 12 }}>
            Help with login, billing, POS, or data questions for existing accounts.
          </p>
          <a href="mailto:support@example.com">support@example.com</a>
        </article>

        <article className="mkt-contact-card mkt-reveal" style={{ '--mkt-delay': '140ms' } as CSSProperties}>
          <h3>Privacy & legal</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65, marginBottom: 12 }}>
            Data requests, privacy inquiries, and compliance questions.
          </p>
          <a href="mailto:privacy@example.com">privacy@example.com</a>
        </article>

        <article className="mkt-contact-card mkt-reveal" style={{ '--mkt-delay': '210ms' } as CSSProperties}>
          <h3>Already have an account?</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.65, marginBottom: 16 }}>
            Sign in to manage your business, staff, and subscription from the app.
          </p>
          <Link href="/login" className="mkt-btn mkt-btn-primary">
            Sign in to BizManager
          </Link>
        </article>
      </section>

      <section className="mkt-cta-band mkt-reveal mkt-reveal-scale">
        <h2>Prefer to explore first?</h2>
        <p>Create a free trial account and see BizManager on your own products and workflow.</p>
        <Link href="/register" className="mkt-btn mkt-btn-primary mkt-btn-lg">
          Start free trial
        </Link>
      </section>
    </MarketingShell>
  );
}
