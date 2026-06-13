export function getPathSegment(pathname: string | null, offsetFromEnd = 0) {
  if (!pathname) return '';

  const segments = pathname.split('/').filter(Boolean);
  const index = segments.length - 1 - offsetFromEnd;
  const value = segments[index];

  return value ? decodeURIComponent(value) : '';
}
