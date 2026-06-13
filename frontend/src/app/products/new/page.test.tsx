'use client';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import NewProductPage from './page';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  createProduct: vi.fn(),
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
  productsAPI: {
    create: mocks.createProduct,
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

describe('New product page', () => {
  beforeEach(() => {
    mocks.push.mockReset();
    mocks.back.mockReset();
    mocks.createProduct.mockReset();
    mocks.showToast.mockReset();
    mocks.queueAppMutation.mockReset();
    mocks.shouldQueueOfflineNow.mockReset();
    mocks.isOfflineLikeError.mockReset();
    mocks.shouldQueueOfflineNow.mockReturnValue(false);
    mocks.isOfflineLikeError.mockReturnValue(false);
  });

  it('queues the product locally when offline and keeps the user on the page', async () => {
    mocks.shouldQueueOfflineNow.mockReturnValue(true);

    render(<NewProductPage />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Indomie Noodles'), {
      target: { value: 'Offline Soap' },
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. NDL-001'), {
      target: { value: 'SOAP-1' },
    });
    fireEvent.change(screen.getAllByPlaceholderText('0.00')[0], {
      target: { value: '12.5' },
    });
    fireEvent.change(screen.getAllByRole('spinbutton')[2], {
      target: { value: '4' },
    });
    fireEvent.change(screen.getAllByRole('spinbutton')[3], {
      target: { value: '2' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save Product' }));

    expect(mocks.queueAppMutation).toHaveBeenCalledWith('create_product', {
      name: 'Offline Soap',
      sku: 'SOAP-1',
      price: 12.5,
      cost_price: undefined,
      stock_qty: 4,
      reorder_level: 2,
      unit: 'piece',
    });
    expect(mocks.showToast).toHaveBeenCalledWith('Product saved offline. It will sync automatically.', 'success');
    expect(mocks.createProduct).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('e.g. Indomie Noodles')).toHaveValue('');
    expect(screen.getByPlaceholderText('e.g. NDL-001')).toHaveValue('');
  });
});
