import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Edit Product',
};

export default function EditProductLayout({ children }: { children: React.ReactNode }) {
  return children;
}
