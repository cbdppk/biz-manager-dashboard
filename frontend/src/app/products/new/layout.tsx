import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Add Product',
};

export default function NewProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
