export function formatMoneyGhs(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  return `GH₵ ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

export function formatDateGh(value: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GH', options ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTimeGh(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit', hour12: true });
}
