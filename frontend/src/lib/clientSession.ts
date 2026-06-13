/** Clear tenant-specific client caches on logout (not theme preference). */
export function clearClientSessionState() {
  if (typeof window === 'undefined') return;

  const localKeys = [
    'bm_biz_name',
    'bm_pos_cart',
    'bm_pos_product_cache',
    'bm_pos_customer_cache',
    'bm_pos_outbox',
    'bm_operating_mode',
    'bm_onboarding_dismissed',
  ];

  for (const key of localKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch { /* ignore */ }
  }

  try {
    window.sessionStorage.removeItem('bm_pos_cart');
    window.sessionStorage.removeItem('bm_ai_greeting');
  } catch { /* ignore */ }
}
