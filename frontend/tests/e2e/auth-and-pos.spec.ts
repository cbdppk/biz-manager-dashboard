import { expect, test } from '@playwright/test';
import { SEEDED_OWNER_EMAIL, login } from './helpers/auth';

test('redirects unauthenticated users from protected routes', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test('restores the POS cart after a reload for an authenticated user', async ({ page }) => {
  await login(page, SEEDED_OWNER_EMAIL);

  await page.goto('/pos');
  await page.getByPlaceholder('Search products…').fill('cowbell');
  await page.waitForTimeout(350);
  await page.getByText('Cowbell Milk').click();
  await page.waitForFunction(() => {
    const raw = window.sessionStorage.getItem('bm_pos_cart');
    return typeof raw === 'string' && raw.includes('2b16a484-ae75-4c2a-98e2-6e6dfb87a101');
  });

  await page.reload();

  await expect(page.getByText('Cowbell Milk')).toBeVisible();
  await expect(page.getByText('GH₵ 4.50').first()).toBeVisible();
});
