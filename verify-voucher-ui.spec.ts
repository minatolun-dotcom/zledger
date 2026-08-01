import { test, expect } from '@playwright/test';

const VOUCHER_TYPES = [
  { id: 'sales', label: 'Sales Invoice', accountLabel: 'Party Account' },
  { id: 'purchase', label: 'Purchase Invoice', accountLabel: 'Supplier Account' },
  { id: 'payment', label: 'Payment', hasOutstanding: true },
  { id: 'receipt', label: 'Receipt', hasOutstanding: true },
  { id: 'contra', label: 'Contra' },
  { id: 'journal', label: 'Journal', hasAddLine: true },
  { id: 'credit_note', label: 'Credit Note' },
  { id: 'debit_note', label: 'Debit Note' },
];

test.describe('Phase 1 Voucher UI Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:9090');
    await page.fill('input[type="email"]', 'admin@zledger.com');
    await page.fill('input[type="password"]', 'katheikei');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
  });

  for (const vType of VOUCHER_TYPES) {
    test(`${vType.label} - verify UI improvements`, async ({ page }) => {
      // Navigate to voucher page
      await page.goto(`http://localhost:9090/vouchers?tab=create&type=${vType.id}`);
      await page.waitForTimeout(1500);

      // Extract text content
      const bodyText = await page.locator('body').innerText();

      // Verify labels
      if (vType.accountLabel) {
        expect(bodyText).toContain(vType.accountLabel);
      }

      // Verify sidebar exists with "Grand Total" (not "Net Amount")
      if (!vType.id.includes('journal')) {
        expect(bodyText).toContain('Grand Total');
        expect(bodyText).not.toContain('Net Amount');
      }

      // Verify keyboard hints
      if (vType.hasAddLine || vType.id === 'sales' || vType.id === 'purchase') {
        expect(bodyText).toContain('Ctrl+Enter');
      }

      console.log(`✓ ${vType.label} verified`);
    });
  }

  test('Sales form - party details with outstanding', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=sales');
    await page.waitForTimeout(1500);

    // Open party selector
    const partySelector = page.locator('[data-field="account"]');
    await partySelector.click();
    await page.waitForTimeout(500);

    // Check if GSTIN chips are visible in options (party type labels)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Customer|Supplier/);

    console.log('✓ Sales form party selector shows enriched labels');
  });

  test('Purchase form - real outstanding (not ₹0.00)', async ({ page }) => {
    await page.goto('http://localhost:9090/vouchers?tab=create&type=purchase');
    await page.waitForTimeout(1500);

    // Select a supplier with outstanding
    await page.locator('[data-field="account"]').click();
    await page.waitForTimeout(300);
    
    // Type to search for a supplier
    await page.keyboard.type('Crown');
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);

    const bodyText = await page.locator('body').innerText();
    
    // Should NOT show the old hardcoded ₹0.00
    // Real outstanding will show actual value or "—"
    const hasOldFakeOutstanding = bodyText.includes('Outstanding') && bodyText.match(/Outstanding[\s\n]*₹0\.00/);
    expect(hasOldFakeOutstanding).toBeFalsy();

    console.log('✓ Purchase form shows real outstanding (no fake ₹0.00)');
  });
});
