import { test, expect } from '@playwright/test';

test.describe('Payment and Receipt Voucher Redesign Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:9090');
    await page.fill('input[type="email"]', 'admin@zledger.com');
    await page.fill('input[type="password"]', 'katheikei');
    await page.click('button:has-text("Sign In")');
    await page.waitForURL('**/dashboard');
  });

  test('Payment voucher has horizontal layout with 5 fields', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=payment');
    await page.waitForSelector('[data-field="date"]');

    // Check for horizontal layout (5 columns: Date, Voucher No, Paid To, Paid From, Amount)
    const topCard = page.locator('.rounded-lg').first();
    await expect(topCard).toBeVisible();

    // Verify all 5 fields are present in the top card
    await expect(page.locator('label:has-text("Date")')).toBeVisible();
    await expect(page.locator('label:has-text("Voucher No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Paid To")')).toBeVisible();
    await expect(page.locator('label:has-text("Paid From")')).toBeVisible();
    await expect(page.locator('label:has-text("Amount")')).toBeVisible();

    // Verify voucher number is displayed (auto-fetched with financial_year_id)
    const voucherNoText = await page.locator('label:has-text("Voucher No.")').locator('..').locator('div').nth(1).textContent();
    console.log('Payment Voucher No:', voucherNoText);
    expect(voucherNoText).not.toBe('—');

    // Verify narration field is present
    await expect(page.locator('textarea[placeholder*="Narration"]')).toBeVisible();

    // Verify save button
    await expect(page.locator('button:has-text("Save Payment")')).toBeVisible();
  });

  test('Receipt voucher has horizontal layout with 5 fields', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=receipt');
    await page.waitForSelector('[data-field="date"]');

    // Check for horizontal layout (5 columns: Date, Voucher No, Received From, Deposit To, Amount)
    const topCard = page.locator('.rounded-lg').first();
    await expect(topCard).toBeVisible();

    // Verify all 5 fields are present in the top card
    await expect(page.locator('label:has-text("Date")')).toBeVisible();
    await expect(page.locator('label:has-text("Voucher No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Received From")')).toBeVisible();
    await expect(page.locator('label:has-text("Deposit To")')).toBeVisible();
    await expect(page.locator('label:has-text("Amount")')).toBeVisible();

    // Verify voucher number is displayed (auto-fetched with financial_year_id)
    const voucherNoText = await page.locator('label:has-text("Voucher No.")').locator('..').locator('div').nth(1).textContent();
    console.log('Receipt Voucher No:', voucherNoText);
    expect(voucherNoText).not.toBe('—');

    // Verify narration field is present
    await expect(page.locator('textarea[placeholder*="Narration"]')).toBeVisible();

    // Verify save button
    await expect(page.locator('button:has-text("Save Receipt")')).toBeVisible();
  });

  test('Payment voucher shows payment mode and reference fields when Paid From is selected', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=payment');
    await page.waitForSelector('[data-field="date"]');

    // Select a Paid From ledger (cash/bank)
    await page.click('[data-field="paid_from"] input');
    await page.waitForSelector('[data-master-popup="true"]');
    await page.click('text=Cash in Hand');
    await page.waitForTimeout(500);

    // Verify payment mode and reference fields appear
    await expect(page.locator('label:has-text("Payment Mode")')).toBeVisible();
    await expect(page.locator('label:has-text("Reference No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Notes / Reference")')).toBeVisible();
  });

  test('Receipt voucher shows payment mode and reference fields when Deposit To is selected', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=receipt');
    await page.waitForSelector('[data-field="date"]');

    // Select a Deposit To ledger (cash/bank)
    await page.click('[data-field="deposit_to"] input');
    await page.waitForSelector('[data-master-popup="true"]');
    await page.click('text=Cash in Hand');
    await page.waitForTimeout(500);

    // Verify payment mode and reference fields appear
    await expect(page.locator('label:has-text("Payment Mode")')).toBeVisible();
    await expect(page.locator('label:has-text("Reference No.")')).toBeVisible();
    await expect(page.locator('label:has-text("Notes / Reference")')).toBeVisible();
  });
});
