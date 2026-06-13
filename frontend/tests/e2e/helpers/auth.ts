import { expect, type Page } from '@playwright/test';

export const SEEDED_OWNER_EMAIL = 'owner@demo.example.com';
export const SEEDED_CASHIER_EMAIL = 'cashier@demo.example.com';
export const SEEDED_PASSWORD = 'DemoPass123!';

export async function login(page: Page, email: string, password = SEEDED_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\?.*)?$/, { timeout: 20_000 });
}
