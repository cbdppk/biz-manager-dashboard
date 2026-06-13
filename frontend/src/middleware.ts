import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PREFIXES = [
  '/onboarding',
  '/dashboard',
  '/pos',
  '/food-pos',
  '/menu',
  '/daily-close',
  '/orders',
  '/reports',
  '/expenses',
  '/notifications',
  '/products',
  '/customers',
  '/invoices',
  '/sales',
  '/settings',
];

const AUTH_PAGES = new Set(['/login', '/register']);

function isProtectedRoute(pathname: string) {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readAuthToken(request: NextRequest) {
  const raw = request.cookies.get('bm_token')?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function parseExp(token: string) {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    const decoded = JSON.parse(atob(padded));
    return typeof decoded.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

function loginRedirectUrl(request: NextRequest) {
  const url = new URL('/login', request.url);
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.searchParams.set('next', next);
  return url;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = readAuthToken(request);
  const protectedRoute = isProtectedRoute(pathname);
  const authPage = AUTH_PAGES.has(pathname);

  if (!token) {
    if (protectedRoute) {
      return NextResponse.redirect(loginRedirectUrl(request));
    }

    return NextResponse.next();
  }

  const exp = parseExp(token);

  if (exp && exp <= Math.floor(Date.now() / 1000) + 30) {
    const response = NextResponse.redirect(protectedRoute ? loginRedirectUrl(request) : new URL('/login', request.url));
    response.cookies.set('bm_token', '', { path: '/', maxAge: 0 });
    return response;
  }

  if (authPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/onboarding',
    '/dashboard/:path*',
    '/pos/:path*',
    '/food-pos/:path*',
    '/menu/:path*',
    '/daily-close/:path*',
    '/orders/:path*',
    '/reports/:path*',
    '/expenses/:path*',
    '/notifications/:path*',
    '/products/:path*',
    '/customers/:path*',
    '/invoices/:path*',
    '/sales/:path*',
    '/settings/:path*',
    '/login',
    '/register',
  ],
};
