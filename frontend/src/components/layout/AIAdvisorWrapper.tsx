'use client';

import { usePathname } from 'next/navigation';
import AIAdvisor from '@/components/features/AIAdvisor';

const HIDE_EXACT = new Set(['/', '/login', '/register']);

export default function AIAdvisorWrapper() {
  const pathname = usePathname();
  if (HIDE_EXACT.has(pathname)) return null;
  return <AIAdvisor />;
}
