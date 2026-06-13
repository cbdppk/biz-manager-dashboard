import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'New Customer',
};

export default function NewCustomerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
