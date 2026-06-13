import Link from 'next/link';
import type { Metadata } from 'next';
import MarketingShell from '@/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: 'Privacy Policy',
};

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <section className="mkt-page-hero">
        <div className="mkt-container mkt-reveal is-visible">
          <h1>Privacy Policy</h1>
          <p>How BizManager collects, uses, and protects your business and customer data.</p>
        </div>
      </section>

      <div className="mkt-container mkt-prose">
        <div className="card flex flex-col gap-6 mkt-reveal">
          <p><strong>Last updated:</strong> April 2026</p>

          <section>
            <h2>1. Information we collect</h2>
            <p>BizManager collects information to provide better services to all our users. We collect:</p>
            <ul>
              <li><strong>Account information:</strong> Name, business name, email, and phone number.</li>
              <li><strong>Business data:</strong> Inventory, sales records, customer details, and invoice history entered into the platform.</li>
              <li><strong>Device &amp; usage data:</strong> IP address, browser type, and interaction metrics.</li>
            </ul>
          </section>

          <section>
            <h2>2. How we use your information</h2>
            <p>Your data is strictly used to provide the BizManager service. Specifically:</p>
            <ul>
              <li>To synchronize your point-of-sale data across devices.</li>
              <li>To generate business insights via our AI Advisor.</li>
              <li>To process subscription billing and Mobile Money (MoMo) transactions.</li>
            </ul>
          </section>

          <section>
            <h2>3. Data security &amp; isolation</h2>
            <p>
              We employ enterprise-grade row-level security. Your business data is isolated from other tenants.
              We do not sell your customer lists or sales history to third parties.
            </p>
          </section>

          <section>
            <h2>4. Contact us</h2>
            <p>
              For privacy inquiries or to request data deletion, contact{' '}
              <a href="mailto:privacy@example.com" style={{ color: 'var(--accent)' }}>privacy@example.com</a>
              {' '}or visit our <Link href="/contact" style={{ color: 'var(--accent)' }}>contact page</Link>.
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
