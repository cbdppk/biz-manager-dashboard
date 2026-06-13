'use client';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSPage from './page';

const mocks = vi.hoisted(() => ({
  productsList: vi.fn(),
  salesCreate: vi.fn(),
  momoCollect: vi.fn(),
  momoStatus: vi.fn(),
  customersList: vi.fn(),
  customersCreate: vi.fn(),
  showToast: vi.fn(),
  addNotification: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  productsAPI: {
    list: mocks.productsList,
  },
  salesAPI: {
    create: mocks.salesCreate,
  },
  momoAPI: {
    collect: mocks.momoCollect,
    status: mocks.momoStatus,
  },
  customersAPI: {
    list: mocks.customersList,
    create: mocks.customersCreate,
  },
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mocks.showToast,
  }),
}));

vi.mock('@/lib/notifications', () => ({
  addNotification: mocks.addNotification,
}));

describe('POS page', () => {
  beforeEach(() => {
    mocks.productsList.mockReset();
    mocks.salesCreate.mockReset();
    mocks.momoCollect.mockReset();
    mocks.momoStatus.mockReset();
    mocks.customersList.mockReset();
    mocks.customersCreate.mockReset();
    mocks.showToast.mockReset();
    mocks.addNotification.mockReset();
    mocks.customersList.mockResolvedValue({ data: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('restores a saved cart from session storage', async () => {
    window.sessionStorage.setItem('bm_pos_cart', JSON.stringify({
      cart: [
        {
          product: { id: 'p-1', name: 'Milk', price: 12.5, stock_qty: 6 },
          qty: 2,
        },
      ],
      paymentMethod: 'Cash',
      amountPaid: '25',
    }));

    render(<POSPage />);

    expect(await screen.findByText('Milk')).toBeInTheDocument();
    expect(screen.getAllByText('GH₵ 25.00')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /charge\s+gh₵ 25\.00/i })).toBeInTheDocument();
  });

  it('persists newly added cart items across reloads', async () => {
    mocks.productsList.mockResolvedValue({
      data: [{ id: 'p-2', name: 'Soap', price: 10, stock_qty: 8 }],
    });

    const firstRender = render(<POSPage />);

    fireEvent.change(screen.getByPlaceholderText('Search products…'), {
      target: { value: 'soap' },
    });

    fireEvent.click(await screen.findByText('Soap', {}, { timeout: 1500 }));

    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem('bm_pos_cart') || '{}');
      expect(persisted.cart?.[0]?.product?.id).toBe('p-2');
      expect(persisted.cart?.[0]?.qty).toBe(1);
    });

    firstRender.unmount();
    render(<POSPage />);

    expect(await screen.findByText('Soap')).toBeInTheDocument();
  });
});
