import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'POS',
};

export default function POSLayout({ children }: { children: React.ReactNode }) {
  return children;
}
