import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Invoice Detail',
};

export default function InvoiceDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
