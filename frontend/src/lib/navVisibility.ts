/** Paths where bottom nav and desktop sidebar are hidden. */
export const HIDE_APP_NAV_PATHS = new Set([
  '/',
  '/about',
  '/pricing',
  '/contact',
  '/privacy',
  '/terms',
  '/login',
  '/register',
  '/invoices/new',
]);

export function shouldHideAppNav(pathname: string) {
  return HIDE_APP_NAV_PATHS.has(pathname);
}
