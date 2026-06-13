import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sale Detail',
};

export default function SaleDetailLayout({ children }: { children: React.ReactNode }) {
  return children;
}
