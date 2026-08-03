import { test, expect } from '@playwright/test';
import { loginAsAdmin } from '../helpers/login';

test.describe('Payment and Receipt Voucher Redesign Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('Payment voucher has horizontal layout with fields', async ({ page }) => {
    await page.goto('/vouchers?tab=create&type=payment');
    await page.waitForSelector('[data-field="date"]');

    // Check for horizontal layout card
    const topCard = page.locator('.rounded-lg').first();
    await expect(topCard).toBeVisible();

    // Verify key fields are present in the top card
    await expect(page.locator('label:has-text("Date")')).toBeVisible();
    await expect(page.locator('label:has-text("Voucher No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Account (Paid From)")')).toBeVisible();

    // Verify voucher number input exists
    const voucherNoInput = page.locator('input[data-field="voucher_number"]');
    await expect(voucherNoInput).toBeVisible();
    const voucherNoValue = await voucherNoInput.inputValue();
    console.log('Payment Voucher No:', voucherNoValue);

    // Verify narration field is present
    await expect(page.locator('textarea[placeholder*="Narration"]')).toBeVisible();

    // Verify save button
    await expect(page.locator('button').filter({ hasText: /^Save$/ })).toBeVisible();
  });

  test('Receipt voucher has horizontal layout with fields', async ({ page }) => {
    await page.goto('/vouchers?tab=create&type=receipt');
    await page.waitForSelector('[data-field="date"]');

    // Check for horizontal layout card
    const topCard = page.locator('.rounded-lg').first();
    await expect(topCard).toBeVisible();

    // Verify key fields are present in the top card
    await expect(page.locator('label:has-text("Date")')).toBeVisible();
    await expect(page.locator('label:has-text("Voucher No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Account (Deposit To)")')).toBeVisible();

    // Verify voucher number input exists
    const voucherNoInput = page.locator('input[data-field="voucher_number"]');
    await expect(voucherNoInput).toBeVisible();
    const voucherNoValue = await voucherNoInput.inputValue();
    console.log('Receipt Voucher No:', voucherNoValue);

    // Verify narration field is present
    await expect(page.locator('textarea[placeholder*="Narration"]')).toBeVisible();

    // Verify save button
    await expect(page.locator('button').filter({ hasText: /^Save$/ })).toBeVisible();
  });

  test('Payment voucher shows payment mode and reference fields when Paid From is selected', async ({ page }) => {
    await page.goto('/vouchers?tab=create&type=payment');
    await page.waitForSelector('[data-field="date"]');

    // Select a Paid From ledger (cash/bank)
    await page.click('[data-field="account"] input');
    await page.waitForSelector('[data-master-popup="true"]');
    await page.getByText('Cash', { exact: true }).click();
    await page.waitForTimeout(500);

    // Verify payment mode and reference fields appear
    await expect(page.locator('label:has-text("Payment Mode")')).toBeVisible();
    await expect(page.locator('label:has-text("Reference No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Notes / Reference")')).toBeVisible();
  });

  test('Receipt voucher shows payment mode and reference fields when Deposit To is selected', async ({ page }) => {
    await page.goto('/vouchers?tab=create&type=receipt');
    await page.waitForSelector('[data-field="date"]');

    // Select a Deposit To ledger (cash/bank)
    await page.click('[data-field="account"] input');
    await page.waitForSelector('[data-master-popup="true"]');
    await page.getByText('Cash', { exact: true }).click();
    await page.waitForTimeout(500);

    // Verify payment mode and reference fields appear
    await expect(page.locator('label:has-text("Payment Mode")')).toBeVisible();
    await expect(page.locator('label:has-text("Reference No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Notes / Reference")')).toBeVisible();
  });
});
