'use client';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SubscriptionPage from './page';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  redirectToExternal: vi.fn(),
  routerBack: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: mocks.routerBack,
  }),
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: mocks.apiGet,
    post: mocks.apiPost,
  },
}));

vi.mock('@/lib/navigation', () => ({
  redirectToExternal: mocks.redirectToExternal,
}));

describe('Subscription page', () => {
  beforeEach(() => {
    mocks.apiGet.mockReset();
    mocks.apiPost.mockReset();
    mocks.redirectToExternal.mockReset();
    mocks.routerBack.mockReset();
    window.history.pushState({}, '', '/settings/subscription');
  });

  it('starts the billing subscribe flow for the selected plan', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/billing/status') {
        return Promise.resolve({
          data: {
            tier: 'free',
            status: 'trial',
            days_remaining: 3,
            trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            can_manage_billing: true,
          },
        });
      }
      return Promise.resolve({
        data: { user: { role: 'owner' }, business: { name: 'Demo Shop' } },
      });
    });
    mocks.apiPost.mockResolvedValue({
      data: {
        checkout_url: 'https://paystack.example/checkout',
      },
    });

    render(<SubscriptionPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Start Basic' }));

    await waitFor(() => {
      expect(mocks.apiPost).toHaveBeenCalledWith('/billing/subscribe', { plan: 'basic' });
      expect(mocks.redirectToExternal).toHaveBeenCalledWith('https://paystack.example/checkout');
    });
  });

  it('shows a friendly error when billing does not return a checkout URL', async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/billing/status') {
        return Promise.resolve({
          data: {
            tier: 'free',
            status: 'trial',
            days_remaining: 3,
            trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            can_manage_billing: true,
          },
        });
      }
      return Promise.resolve({
        data: { user: { role: 'owner' }, business: { name: 'Demo Shop' } },
      });
    });
    mocks.apiPost.mockResolvedValue({ data: {} });

    render(<SubscriptionPage />);

    await userEvent.click(await screen.findByRole('button', { name: 'Start Pro' }));

    expect(await screen.findByText('No checkout URL returned. Please try again.')).toBeInTheDocument();
  });

  it('shows Paystack return processing without fake success', async () => {
    window.history.pushState({}, '', '/settings/subscription?reference=test_ref');
    mocks.apiGet.mockImplementation((url: string) => {
      if (url === '/billing/status') {
        return Promise.resolve({
          data: {
            tier: 'free',
            status: 'trial',
            days_remaining: 3,
            trial_ends_at: new Date(Date.now() + 3 * 86400000).toISOString(),
            can_manage_billing: true,
          },
        });
      }
      return Promise.resolve({
        data: { user: { role: 'owner' }, business: { name: 'Demo Shop' } },
      });
    });

    render(<SubscriptionPage />);

    expect(await screen.findByText('Payment may still be processing. Refresh in a moment or contact support with your reference.')).toBeInTheDocument();
    expect(screen.getByText('Reference: test_ref')).toBeInTheDocument();
  });
});
