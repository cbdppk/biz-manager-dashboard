import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import MarketingShell from '@/components/marketing/MarketingShell';
import { PRICING_PLANS } from '@/components/marketing/marketing-data';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Simple monthly plans for Ghanaian businesses. 14-day free trial, Basic from GHS 79, Pro from GHS 149.',
};

const FAQ = [
  {
    q: 'Is there a free trial?',
    a: 'Yes. Every new business gets 14 days of full access before choosing Basic or Pro.',
  },
  {
    q: 'How do I pay?',
    a: 'Subscriptions are billed securely via Paystack. You can upgrade from Settings after registering.',
  },
  {
    q: 'Can I use BizManager offline?',
    a: 'Yes. Sales queue locally and sync when your connection returns — built for real-world connectivity.',
  },
  {
    q: 'What happens if my subscription lapses?',
    a: 'Your data remains safe. Access may move to read-only until payment is restored, per our terms.',
  },
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="mkt-page-hero">
        <div className="mkt-container mkt-reveal is-visible">
          <p className="mkt-kicker">Pricing</p>
          <h1>Plans that grow with your business</h1>
          <p>
            Transparent monthly pricing in Ghana cedis. No hidden fees — start with a free trial and upgrade when you&apos;re ready.
          </p>
        </div>
      </section>

      <section className="mkt-container" style={{ marginBottom: 56 }}>
        <div className="mkt-pricing-grid">
          {PRICING_PLANS.map((plan, i) => (
            <article
              key={plan.id}
              className={`mkt-price-card mkt-reveal mkt-reveal-scale${plan.featured ? ' is-featured' : ''}`}
              style={{ '--mkt-delay': `${i * 90}ms` } as CSSProperties}
            >
              {plan.featured && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                  }}
                >
                  Most popular
                </span>
              )}
              <h3>{plan.name}</h3>
              <p className="mkt-price">
                {plan.price}
                <small> / {plan.period}</small>
              </p>
              <ul className="mkt-price-features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`mkt-btn mkt-btn-lg ${plan.featured ? 'mkt-btn-primary' : 'mkt-btn-outline'}`}
                style={{ width: '100%' }}
              >
                {plan.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-container" style={{ maxWidth: 720, margin: '0 auto 80px' }}>
        <h2 className="mkt-reveal" style={{ fontSize: 22, fontWeight: 800, textAlign: 'center', marginBottom: 28 }}>Frequently asked questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {FAQ.map((item, i) => (
            <article
              key={item.q}
              className="mkt-feature-card mkt-reveal"
              style={{ padding: '20px 22px', '--mkt-delay': `${i * 70}ms` } as CSSProperties}
            >
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>{item.q}</h3>
              <p style={{ margin: 0 }}>{item.a}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mkt-cta-band mkt-reveal mkt-reveal-scale">
        <h2>Still deciding?</h2>
        <p>Try every feature free for 14 days. Set up your products and run your first sale today.</p>
        <Link href="/register" className="mkt-btn mkt-btn-primary mkt-btn-lg">
          Start free trial
        </Link>
      </section>
    </MarketingShell>
  );
}
