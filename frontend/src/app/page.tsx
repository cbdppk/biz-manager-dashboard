import type { Metadata } from 'next';
import HomePage from '@/components/marketing/HomePage';

export const metadata: Metadata = {
  title: 'BizManager — POS, Inventory & AI for Ghanaian Businesses',
  description:
    'Run your shop or restaurant smarter with mobile POS, inventory, invoicing, MoMo payments, and AI insights. Built for Ghanaian SMEs.',
  openGraph: {
    title: 'BizManager — Business management for Ghana',
    description: 'POS, inventory, invoicing, and AI advisor in one platform.',
    images: [{ url: '/marketing/hero-pos.jpg', width: 1400, height: 1050, alt: 'BizManager POS' }],
  },
};

export default function LandingPage() {
  return <HomePage />;
}
