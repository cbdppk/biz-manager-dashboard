'use client';

import { usePathname } from 'next/navigation';
import BottomNav from './BottomNav';
import { shouldHideAppNav } from '@/lib/navVisibility';

export default function BottomNavWrapper() {
  const pathname = usePathname();
  if (shouldHideAppNav(pathname)) return null;
  return <BottomNav />;
}
