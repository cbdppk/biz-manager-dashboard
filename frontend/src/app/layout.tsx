import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import '../styles/globals.css';
import '../styles/marketing.css';
import AppShell from '@/components/layout/AppShell';
import BottomNavWrapper from '@/components/layout/BottomNavWrapper';
import AIAdvisorWrapper from '@/components/layout/AIAdvisorWrapper';
import RouteProgress from '@/components/layout/RouteProgress';
import AuthSessionSync from '@/components/auth/AuthSessionSync';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import ThemeProvider from '@/components/providers/ThemeProvider';
import AppSyncManager from '@/components/providers/AppSyncManager';
import SwUpdateBanner from '@/components/ui/SwUpdateBanner';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: { default: 'BizManager', template: '%s | BizManager' },
  description: 'The all-in-one POS, inventory, invoicing, and AI advisor platform for Ghanaian businesses.',
  keywords: ['POS', 'inventory', 'invoicing', 'Ghana', 'business management', 'SME'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'BizManager',
  },
  openGraph: {
    title: 'BizManager',
    description: 'Run your Ghanaian business smarter.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#080d1a' },
    { media: '(prefers-color-scheme: light)', color: '#f4f6fa' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dmSans.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {/* Prevent theme flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bm_theme');if(t)document.documentElement.setAttribute('data-theme',t);else if(window.matchMedia('(prefers-color-scheme: light)').matches)document.documentElement.setAttribute('data-theme','light');}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <ErrorBoundary>
              <SwUpdateBanner />
              <AuthSessionSync />
              <AppSyncManager />
              <RouteProgress />
              <AppShell>{children}</AppShell>
              <BottomNavWrapper />
              <AIAdvisorWrapper />
            </ErrorBoundary>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
