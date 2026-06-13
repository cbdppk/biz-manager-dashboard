'use client';

import { usePathname } from 'next/navigation';
import DesktopSidebar from './DesktopSidebar';
import { shouldHideAppNav } from '@/lib/navVisibility';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (shouldHideAppNav(pathname)) {
    return <>{children}</>;
  }

  return (
    <div className="app-shell">
      <DesktopSidebar />
      <div className="app-shell-main">{children}</div>
    </div>
  );
}
