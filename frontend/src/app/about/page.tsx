import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import MarketingShell from '@/components/marketing/MarketingShell';
import { MARKETING_IMAGES } from '@/components/marketing/marketing-data';

export const metadata: Metadata = {
  title: 'About Us',
  description: 'BizManager helps Ghanaian shops and restaurants run POS, inventory, and growth tools in one platform.',
};

const VALUES = [
  {
    title: 'Built for local reality',
    desc: 'MoMo, intermittent connectivity, and multi-staff shops — we design for how Ghanaian businesses actually operate.',
  },
  {
    title: 'Your data stays yours',
    desc: 'Tenant-isolated storage, row-level security, and backend-only database access. We never sell your customer lists.',
  },
  {
    title: 'Ship what matters',
    desc: 'POS, stock, invoices, and reporting first — then AI and integrations that save time, not add complexity.',
  },
];

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="mkt-page-hero">
        <div className="mkt-container mkt-reveal is-visible">
          <p className="mkt-kicker">Our story</p>
          <h1>Helping Ghanaian businesses run with confidence</h1>
          <p>
            BizManager started with a simple idea: small and mid-sized businesses deserve the same operational
            tools as large chains — without enterprise complexity or cost.
          </p>
        </div>
      </section>

      <section className="mkt-container" style={{ marginBottom: 48 }}>
        <div className="mkt-about-banner mkt-reveal mkt-reveal-scale">
          <Image
            src={MARKETING_IMAGES.aboutTeam}
            alt="BizManager team collaborating on product"
            width={1200}
            height={514}
            priority
          />
        </div>

        <div className="mkt-reveal" style={{ maxWidth: 720, margin: '0 auto 40px' }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 14, letterSpacing: '-0.4px' }}>What we do</h2>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 15, marginBottom: 16 }}>
            We build software for owners, managers, and front-line staff who need one source of truth for sales,
            stock, customers, and daily close. From provision stores in Accra to busy kitchens in Kumasi, BizManager
            keeps teams aligned whether they&apos;re online or offline.
          </p>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.75, fontSize: 15 }}>
            Our platform combines a mobile-first POS, inventory and invoicing, food-service workflows, Paystack-ready
            billing, and an AI advisor that turns your data into practical next steps — not generic dashboards.
          </p>
        </div>

        <div className="mkt-values" style={{ marginBottom: 48 }}>
          {VALUES.map((v, i) => (
            <article key={v.title} className="mkt-value mkt-reveal" style={{ '--mkt-delay': `${i * 80}ms` } as CSSProperties}>
              <h3>{v.title}</h3>
              <p>{v.desc}</p>
            </article>
          ))}
        </div>

        <div className="mkt-split" style={{ marginBottom: 0 }}>
          <div className="mkt-split-media mkt-reveal mkt-reveal-left">
            <Image
              src={MARKETING_IMAGES.aboutOffice}
              alt="Modern workspace where BizManager is built"
              width={1200}
              height={825}
            />
          </div>
          <div className="mkt-split-copy mkt-reveal mkt-reveal-right" style={{ '--mkt-delay': '100ms' } as CSSProperties}>
            <p className="mkt-kicker">Mission</p>
            <h3>Equip every serious SME to compete and grow</h3>
            <p>
              We measure success by how reliably our customers close the day, trust their stock numbers, and
              recover revenue they used to leak through manual errors.
            </p>
            <Link href="/register" className="mkt-btn mkt-btn-primary">
              Start your free trial
            </Link>
          </div>
        </div>
      </section>

      <section className="mkt-cta-band mkt-reveal mkt-reveal-scale">
        <h2>Want to work with us?</h2>
        <p>Partnerships, press, and enterprise onboarding — we&apos;d love to hear from you.</p>
        <Link href="/contact" className="mkt-btn mkt-btn-outline mkt-btn-lg">
          Contact the team
        </Link>
      </section>
    </MarketingShell>
  );
}
