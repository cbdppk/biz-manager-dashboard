import type { Metadata } from 'next';
import AuthMarketingShell from '@/components/marketing/AuthMarketingShell';

export const metadata: Metadata = {
  title: 'Register',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthMarketingShell
      title="Start your 14-day free trial"
      subtitle="Set up products, invite staff, and run your first sale in minutes — no credit card required."
    >
      {children}
    </AuthMarketingShell>
  );
}
