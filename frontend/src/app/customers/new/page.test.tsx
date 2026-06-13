'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewCustomerPage from './page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  createCustomer: vi.fn(),
  showToast: vi.fn(),
  queueAppMutation: vi.fn(),
  shouldQueueOfflineNow: vi.fn(),
  isOfflineLikeError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    back: mocks.back,
  }),
}));

vi.mock('@/lib/api', () => ({
  customersAPI: {
    create: mocks.createCustomer,
  },
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('@/lib/appOutbox', () => ({
  queueAppMutation: mocks.queueAppMutation,
  shouldQueueOfflineNow: mocks.shouldQueueOfflineNow,
  isOfflineLikeError: mocks.isOfflineLikeError,
}));

describe('New customer page', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.createCustomer.mockReset();
    mocks.showToast.mockReset();
    mocks.queueAppMutation.mockReset();
    mocks.shouldQueueOfflineNow.mockReset();
    mocks.isOfflineLikeError.mockReset();
    mocks.shouldQueueOfflineNow.mockReturnValue(false);
    mocks.isOfflineLikeError.mockReturnValue(false);
  });

  it('queues the customer locally when offline and keeps the user on the page', async () => {
    mocks.shouldQueueOfflineNow.mockReturnValue(true);

    render(<NewCustomerPage />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Sample Client'), {
      target: { value: 'Demo Customer' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. 0000000000'), {
      target: { value: '0000000000' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. demo@example.com'), {
      target: { value: 'demo@example.org' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Osu, Accra'), {
      target: { value: 'Osu' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Customer' }));

    expect(mocks.queueAppMutation).toHaveBeenCalledWith('create_customer', {
      name: 'Demo Customer',
      phone: '0000000000',
      email: 'demo@example.org',
      address: 'Osu',
      credit_limit: 0,
    });
    expect(mocks.showToast).toHaveBeenCalledWith('Customer saved offline. It will sync automatically.', 'success');
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('e.g. Sample Client')).toHaveValue('');
    expect(screen.getByPlaceholderText('e.g. 0000000000')).toHaveValue('');
  });
});
