export type OperatingMode = 'retail' | 'food';
export const OPERATING_MODE_KEY = 'bm_operating_mode';

export interface BusinessModeContext {
  operatingMode: OperatingMode;
  isFoodMode: boolean;
  enabledModules: string[];
}

export function resolveBusinessMode(business?: {
  operating_mode?: string | null;
  sector?: string | null;
  enabled_modules?: unknown;
} | null): BusinessModeContext {
  const explicitMode = business?.operating_mode === 'food' || business?.operating_mode === 'retail'
    ? business.operating_mode
    : null;

  const sectorFallback = business?.sector === 'restaurant' ? 'food' : 'retail';
  const operatingMode: OperatingMode = (explicitMode || sectorFallback) as OperatingMode;

  const enabledModules = Array.isArray(business?.enabled_modules)
    ? business.enabled_modules.filter((module): module is string => typeof module === 'string')
    : operatingMode === 'food'
      ? ['retail_core', 'food_ops']
      : ['retail_core'];

  return {
    operatingMode,
    isFoodMode: operatingMode === 'food',
    enabledModules,
  };
}

export function isOperatingMode(value: unknown): value is OperatingMode {
  return value === 'food' || value === 'retail';
}

export function getStoredOperatingMode(): OperatingMode {
  if (typeof window === 'undefined') return 'retail';
  const stored = window.localStorage.getItem(OPERATING_MODE_KEY);
  return isOperatingMode(stored) ? stored : 'retail';
}

export function hasStoredOperatingMode() {
  if (typeof window === 'undefined') return false;
  return isOperatingMode(window.localStorage.getItem(OPERATING_MODE_KEY));
}

export function isStoredFoodMode() {
  return getStoredOperatingMode() === 'food';
}

export function storeOperatingMode(mode: OperatingMode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OPERATING_MODE_KEY, mode);
  window.dispatchEvent(new CustomEvent('bm:operating-mode', { detail: { mode } }));
}

export function clearOperatingMode() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OPERATING_MODE_KEY);
  window.dispatchEvent(new CustomEvent('bm:operating-mode', { detail: { mode: null } }));
}
