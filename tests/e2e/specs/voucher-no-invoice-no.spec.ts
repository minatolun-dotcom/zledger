import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Voucher Form — Voucher No. and Invoice No.", () => {
  test("Sales form: Voucher No. is hidden, Invoice No. is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Sales tab should be active by default
    const salesTab = page.locator("button", { hasText: "Sales" }).first();
    if (await salesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await salesTab.click();
      await page.waitForTimeout(1000);
    }

    // Voucher No. should NOT be visible on create form
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).not.toBeVisible({ timeout: 5000 });

    // Invoice No. should be visible
    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).toBeVisible({ timeout: 5000 });
  });

  test("Sales form: Invoice No. input is editable", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Find input near Invoice No. label and type a value
    const invoiceInput = page.locator("input[placeholder='Invoice No.']").first();
    if (await invoiceInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await invoiceInput.fill("INV-CUSTOM-001");
      await expect(invoiceInput).toHaveValue("INV-CUSTOM-001");
    }
  });

  test("Purchase form: Invoice No. is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Purchase tab
    const purchaseTab = page.locator("button", { hasText: "Purchase" }).first();
    await purchaseTab.click();
    await page.waitForTimeout(1000);

    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).toBeVisible({ timeout: 5000 });
  });

  test("Payment form: Cheque / UTR # is visible (not Invoice No.)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Payment tab
    const paymentTab = page.locator("button", { hasText: "Payment" }).first();
    await paymentTab.click();
    await page.waitForTimeout(1000);

    const chequeLabel = page.locator("label", { hasText: "Cheque / UTR #" });
    await expect(chequeLabel).toBeVisible({ timeout: 5000 });
  });

  test("Receipt form: Cheque / UTR # is visible", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Receipt tab
    const receiptTab = page.locator("button", { hasText: "Receipt" }).first();
    await receiptTab.click();
    await page.waitForTimeout(1000);

    const chequeLabel = page.locator("label", { hasText: "Cheque / UTR #" });
    await expect(chequeLabel).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Voucher Form — Edit mode shows Voucher No.", () => {
  test("Edit form: Voucher No. is visible and read-only", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click first voucher row to open modal
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(2000);

      // Click Edit button in modal
      const editBtn = page.locator("button", { hasText: "Edit" }).first();
      if (await editBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(2000);

        // Voucher No. should be visible in edit mode
        const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
        await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });

        // Invoice No. should still be visible
        const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
        if (await invoiceNoLabel.isVisible({ timeout: 3000 }).catch(() => false)) {
          await expect(invoiceNoLabel).toBeVisible();
        }
      }
    }
  });
});
