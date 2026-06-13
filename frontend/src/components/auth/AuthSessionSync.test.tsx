'use client';

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthSessionSync from './AuthSessionSync';

const mocks = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  apiGet: vi.fn(),
  pathname: '/dashboard',
}));

function createToken(exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `header.${payload}.signature`;
}

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({
    replace: mocks.routerReplace,
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mocks.apiGet,
  },
}));

describe('AuthSessionSync', () => {
  beforeEach(() => {
    mocks.routerReplace.mockReset();
    mocks.apiGet.mockReset();
    mocks.pathname = '/dashboard';
    window.localStorage.clear();
  });

  it('tries to refresh expired protected sessions before redirecting to login', async () => {
    window.localStorage.setItem('bm_token', createToken(Math.floor(Date.now() / 1000) - 60));
    mocks.apiGet.mockRejectedValue(new Error('refresh failed'));

    render(<AuthSessionSync />);

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/auth/me');
      expect(mocks.routerReplace).toHaveBeenCalledWith('/login?next=%2Fdashboard');
    });

    expect(window.localStorage.getItem('bm_token')).toBeNull();
  });

  it('redirects food businesses away from the retail POS route', async () => {
    mocks.pathname = '/pos';
    window.localStorage.setItem('bm_token', createToken(Math.floor(Date.now() / 1000) + 3600));
    window.localStorage.setItem('bm_operating_mode', 'food');

    render(<AuthSessionSync />);

    await waitFor(() => {
      expect(mocks.routerReplace).toHaveBeenCalledWith('/food-pos');
    });
  });

  it('redirects cashiers away from restricted sales routes', async () => {
    mocks.pathname = '/sales';
    window.localStorage.setItem('bm_token', createToken(Math.floor(Date.now() / 1000) + 3600));
    mocks.apiGet.mockResolvedValue({ data: { user: { role: 'cashier' } } });

    render(<AuthSessionSync />);

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/auth/me');
      expect(mocks.routerReplace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('redirects cashiers from owner settings to account settings', async () => {
    mocks.pathname = '/settings/staff';
    window.localStorage.setItem('bm_token', createToken(Math.floor(Date.now() / 1000) + 3600));
    mocks.apiGet.mockResolvedValue({ data: { user: { role: 'cashier' } } });

    render(<AuthSessionSync />);

    await waitFor(() => {
      expect(mocks.apiGet).toHaveBeenCalledWith('/auth/me');
      expect(mocks.routerReplace).toHaveBeenCalledWith('/settings/account');
    });
  });
});
