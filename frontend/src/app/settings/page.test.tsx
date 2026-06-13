'use client';

import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './page';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  clearAuthToken: vi.fn(),
  showToast: vi.fn(),
  router: {
    push: vi.fn(),
    replace: vi.fn(),
  },
  toast: {
    showToast: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mocks.router,
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mocks.apiGet,
    patch: mocks.apiPatch,
    post: mocks.apiPost,
  },
}));

vi.mock('@/lib/auth', () => ({
  clearAuthToken: mocks.clearAuthToken,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => mocks.toast,
}));

vi.mock('@/components/providers/ThemeProvider', () => ({
  useTheme: () => ({
    theme: 'dark',
    toggleTheme: vi.fn(),
  }),
}));

describe('Settings page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPatch.mockReset();
    mocks.apiPost.mockReset();
    mocks.push.mockReset();
    mocks.replace.mockReset();
    mocks.clearAuthToken.mockReset();
    mocks.showToast.mockReset();
    mocks.router.push.mockReset();
    mocks.router.replace.mockReset();
    mocks.toast.showToast.mockReset();

    mocks.apiGet.mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          data: {
            staff_count: 2,
            user: { role: 'owner' },
          },
        });
      }

      if (url === '/settings') {
        return Promise.resolve({
          data: {
            low_stock_alerts: true,
            daily_summary_sms: false,
            whatsapp_enabled: false,
          },
        });
      }

      return Promise.reject(new Error(`Unhandled GET ${url}`));
    });
    mocks.apiPatch.mockResolvedValue({ data: {} });
    mocks.apiPost.mockResolvedValue({ data: { success: true } });
  });

  it('saves notification toggles through the settings API', async () => {
    const { container } = render(<SettingsPage />);

    /* Settings page shows a skeleton until /settings + /auth/me resolve, so
       wait for the real toggle to appear before interacting with it. */
    const lowStockToggle = await waitFor(() => {
      const el = container.querySelector('#toggle-low-stock') as HTMLInputElement | null;
      if (!el) throw new Error('Low stock toggle not yet rendered');
      return el;
    });

    expect(lowStockToggle.checked).toBe(true);

    fireEvent.click(lowStockToggle);

    await waitFor(() => {
      expect(mocks.apiPatch).toHaveBeenCalledWith('/settings', { low_stock_alerts: false });
    });
  });

  it('blocks invalid password confirmation before calling the backend', async () => {
    render(<SettingsPage />);

    await userEvent.click(await screen.findByText('Change Password'));
    await userEvent.type(screen.getByPlaceholderText('Current password'), 'current-pass');
    await userEvent.type(screen.getByPlaceholderText('New password'), 'new-password');
    await userEvent.type(screen.getByPlaceholderText('Confirm new password'), 'different-password');
    await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

    expect(await screen.findByText('New passwords do not match.')).toBeInTheDocument();
    expect(mocks.apiPost).not.toHaveBeenCalled();
  });

});
