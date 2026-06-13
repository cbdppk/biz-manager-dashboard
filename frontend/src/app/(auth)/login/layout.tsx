import type { Metadata } from 'next';
import AuthMarketingShell from '@/components/marketing/AuthMarketingShell';

export const metadata: Metadata = {
  title: 'Login',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthMarketingShell
      title="Your business, one dashboard"
      subtitle="POS, inventory, invoices, and reports — built for Ghanaian shops and restaurants."
    >
      {children}
    </AuthMarketingShell>
  );
}
