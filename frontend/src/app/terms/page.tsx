import Link from 'next/link';
import type { Metadata } from 'next';
import MarketingShell from '@/components/marketing/MarketingShell';

export const metadata: Metadata = {
  title: 'Terms of Service',
};

export default function TermsPage() {
  return (
    <MarketingShell>
      <section className="mkt-page-hero">
        <div className="mkt-container mkt-reveal is-visible">
          <h1>Terms of Service</h1>
          <p>The agreement between your business and BizManager when using our platform.</p>
        </div>
      </section>

      <div className="mkt-container mkt-prose">
        <div className="card flex flex-col gap-6 mkt-reveal">
          <p><strong>Last updated:</strong> April 2026</p>

          <section>
            <h2>1. Acceptance of terms</h2>
            <p>
              By accessing or using BizManager, you agree to be bound by these Terms of Service.
              If you do not agree to all terms, do not use our services.
            </p>
          </section>

          <section>
            <h2>2. Service provision &amp; uptime</h2>
            <p>
              BizManager provides point-of-sale, inventory, and analytics tools. While we feature offline-first
              capabilities, an internet connection is required for data synchronization, AI features, and mobile
              money collections. We strive for 99.9% uptime but do not guarantee uninterrupted service.
            </p>
          </section>

          <section>
            <h2>3. Payments &amp; subscriptions</h2>
            <p>
              BizManager is a paid SaaS product. Following the trial period, a valid subscription is required.
              Failure to renew may result in restricted access (read-only mode) to your data until the account is settled.
              See <Link href="/pricing" style={{ color: 'var(--accent)' }}>pricing</Link> for current plans.
            </p>
          </section>

          <section>
            <h2>4. Acceptable use</h2>
            <p>
              You agree not to use BizManager for any illegal activities, including but not limited to processing
              fraudulent transactions or sending unsolicited spam via our WhatsApp/SMS integrations.
            </p>
          </section>

          <section>
            <h2>5. Questions</h2>
            <p>
              Contact us at <a href="mailto:hello@example.com" style={{ color: 'var(--accent)' }}>hello@example.com</a>.
            </p>
          </section>
        </div>
      </div>
    </MarketingShell>
  );
}
