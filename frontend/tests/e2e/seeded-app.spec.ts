import { expect, test } from '@playwright/test';
import { SEEDED_CASHIER_EMAIL, SEEDED_OWNER_EMAIL, login } from './helpers/auth';

test('seeded owner account can browse core app pages', async ({ page }) => {
  await login(page, SEEDED_OWNER_EMAIL);

  await expect(page.getByText('Sample Ventures Demo')).toBeVisible();
  await expect(page.getByText('Today\'s Revenue')).toBeVisible();
  await expect(page.getByText(/day[s]? remaining/i)).toBeVisible();

  await page.goto('/products');
  await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();
  await expect(page.getByText('Cowbell Milk')).toBeVisible();
  await page.getByRole('button', { name: 'Low Stock' }).click();
  await expect(page.getByText('Milo Sachet')).toBeVisible();

  await page.goto('/customers');
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByText('Demo Customer')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Example User')).toBeVisible({ timeout: 15_000 });

  await page.goto('/customers/3432a2df-a244-45bd-8998-6625f4f0c003');
  await expect(page.getByRole('heading', { name: 'Example User' })).toBeVisible();
  await expect(page.getByText('GH₵ 103.00', { exact: true })).toBeVisible();

  await page.goto('/sales');
  await expect(page.getByRole('heading', { name: 'Sales' })).toBeVisible();
  await expect(page.getByText('Revenue Trend')).toBeVisible();
  await expect(page.getByText('Demo Customer')).toBeVisible();

  await page.goto('/invoices');
  await expect(page.getByRole('heading', { name: 'Invoices' })).toBeVisible();
  await expect(page.getByText('INV-0013')).toBeVisible();
  await expect(page.getByText('INV-0012')).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByText('Low Stock Alerts')).toBeVisible();

  await page.goto('/settings/staff');
  await expect(page.getByRole('heading', { name: 'Staff' })).toBeVisible();
  await expect(page.getByText('manager@demo.example.com')).toBeVisible();
  await expect(page.getByText('cashier@demo.example.com')).toBeVisible();
});

test('cashier account is redirected away from restricted settings pages', async ({ page }) => {
  await login(page, SEEDED_CASHIER_EMAIL);

  await page.goto('/settings');
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 20_000 });
});
