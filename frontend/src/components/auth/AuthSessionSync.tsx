'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { clearAuthToken, getStoredToken, isTokenExpired, syncAuthToken } from '@/lib/auth';
import { getStoredOperatingMode, hasStoredOperatingMode, resolveBusinessMode, storeOperatingMode } from '@/lib/businessMode';

const PROTECTED_PREFIXES = [
  '/onboarding',
  '/dashboard',
  '/pos',
  '/food-pos',
  '/products',
  '/customers',
  '/invoices',
  '/sales',
  '/orders',
  '/menu',
  '/daily-close',
  '/reports',
  '/expenses',
  '/notifications',
  '/settings',
];

const AUTH_PAGES = new Set(['/login', '/register']);
const FOOD_ONLY_PREFIXES = ['/food-pos', '/menu', '/daily-close', '/orders', '/reports'];
const RETAIL_ONLY_PREFIXES = ['/pos'];

const OWNER_OR_MANAGER_PREFIXES = [
  '/sales',
  '/invoices',
  '/reports',
  '/expenses',
  '/settings/staff',
  '/settings/subscription',
  '/settings/whatsapp',
  '/settings/profile',
  '/settings/audit',
];

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function requiresOwnerOrManager(pathname: string) {
  return OWNER_OR_MANAGER_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function redirectForMode(pathname: string) {
  if (!hasStoredOperatingMode()) return null;
  const mode = getStoredOperatingMode();
  if (mode === 'food' && matchesPrefix(pathname, RETAIL_ONLY_PREFIXES)) return '/food-pos';
  if (mode === 'retail' && matchesPrefix(pathname, FOOD_ONLY_PREFIXES)) return '/dashboard';
  return null;
}

function getLoginUrl(pathname: string) {
  const next = encodeURIComponent(pathname);
  return `/login?next=${next}`;
}

function redirectCashierFromRestricted(pathname: string, router: { replace: (url: string) => void }) {
  if (pathname.startsWith('/settings/support') || pathname.startsWith('/settings/feedback') || pathname.startsWith('/settings/account')) {
    return;
  }
  if (pathname === '/settings' || pathname.startsWith('/settings/')) {
    router.replace('/settings/account');
    return;
  }
  router.replace('/dashboard');
}

export default function AuthSessionSync() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname) return;

    const protectedRoute = isProtectedRoute(pathname);
    const authPage = AUTH_PAGES.has(pathname);
    const token = getStoredToken();

    if (token && isTokenExpired(token)) {
      if (!protectedRoute) {
        clearAuthToken();
        return;
      }

      let cancelled = false;
      api.get('/auth/me')
        .then((res) => {
          if (cancelled) return;
          if (res.data?.business) {
            const mode = resolveBusinessMode(res.data.business);
            storeOperatingMode(mode.operatingMode);
            const redirect = redirectForMode(pathname);
            if (redirect) {
              router.replace(redirect);
              return;
            }
          }
          if (res.data?.user?.role === 'cashier' && requiresOwnerOrManager(pathname)) {
            redirectCashierFromRestricted(pathname, router);
          }
        })
        .catch(() => {
          if (cancelled) return;
          clearAuthToken();
          router.replace(getLoginUrl(pathname));
        });

      return () => {
        cancelled = true;
      };
    }

    const synced = syncAuthToken();

    if (protectedRoute && !synced.token) {
      router.replace(getLoginUrl(pathname));
      return;
    }

    const modeRedirect = redirectForMode(pathname);
    if (modeRedirect) {
      router.replace(modeRedirect);
      return;
    }

    if (authPage && synced.token) {
      router.replace('/dashboard');
      return;
    }

    const modeSpecificRoute = matchesPrefix(pathname, FOOD_ONLY_PREFIXES) || matchesPrefix(pathname, RETAIL_ONLY_PREFIXES);
    const needsModeSync = modeSpecificRoute && !hasStoredOperatingMode();

    if ((!requiresOwnerOrManager(pathname) && !needsModeSync) || !synced.token) {
      return;
    }

    let cancelled = false;

    api.get('/auth/me')
      .then((res) => {
        if (cancelled) return;
        if (res.data?.business) {
          const mode = resolveBusinessMode(res.data.business);
          storeOperatingMode(mode.operatingMode);
          const redirect = redirectForMode(pathname);
          if (redirect) {
            router.replace(redirect);
            return;
          }
        }

        if (res.data?.user?.role === 'cashier') {
          redirectCashierFromRestricted(pathname, router);
        }
      })
      .catch((err) => {
        if (cancelled) return;

        if (err.response?.status === 401) {
          clearAuthToken();
          router.replace(getLoginUrl(pathname));
        } else if (err.response?.status === 403) {
          router.replace('/dashboard');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  return null;
}
