import { clearOperatingMode } from '@/lib/businessMode';
import { clearClientSessionState } from '@/lib/clientSession';

/**
 * Auth model (beta): JWT in localStorage + mirrored `bm_token` cookie for Next middleware.
 * Acceptable for beta/PWA demos. Production hardening should move to HttpOnly Secure
 * session cookies set by the backend on login/refresh and cleared server-side on logout.
 */
export const AUTH_TOKEN_KEY = 'bm_token';
export const AUTH_COOKIE_NAME = 'bm_token';
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

type JwtPayload = {
  exp?: number;
  [key: string]: unknown;
};

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  if (typeof window !== 'undefined' && typeof window.atob === 'function') {
    return window.atob(padded);
  }

  return '';
}

export function parseJwtPayload(token: string | null | undefined): JwtPayload | null {
  if (!token) return null;

  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    return JSON.parse(decodeBase64Url(payload));
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null | undefined, skewSeconds = 30) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp <= Math.floor(Date.now() / 1000) + skewSeconds;
}

function getCookieMaxAge(token: string) {
  const payload = parseJwtPayload(token);
  if (!payload?.exp) return DEFAULT_MAX_AGE_SECONDS;

  const maxAge = payload.exp - Math.floor(Date.now() / 1000);
  return Math.max(0, maxAge);
}

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

export function writeAuthCookie(token: string) {
  if (typeof document === 'undefined') return;

  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${getCookieMaxAge(token)}; SameSite=Lax${secure}`;
}

export function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${AUTH_COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function setAuthToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  writeAuthCookie(token);
}

export function clearAuthToken() {
  clearClientSessionState();
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  clearOperatingMode();
  clearAuthCookie();
}

export function syncAuthToken() {
  const token = getStoredToken();

  if (!token) {
    clearAuthCookie();
    return { token: null, expired: false };
  }

  if (isTokenExpired(token)) {
    clearAuthToken();
    return { token: null, expired: true };
  }

  writeAuthCookie(token);
  return { token, expired: false };
}
