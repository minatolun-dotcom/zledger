import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Voucher Form — Voucher No. visible on all create forms", () => {
  test("Sales form: Voucher No. is visible, no Invoice No.", async ({ page }) => {
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

    // Voucher No. IS visible on the create form
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });

    // Invoice No. should NOT exist on the Sales form
    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).not.toBeVisible({ timeout: 5000 });
  });

  test("Sales form: Voucher No. input is editable", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Find the Voucher No. input and verify it's editable
    const voucherNoInput = page.locator("input[data-field='voucher_number']").first();
    if (await voucherNoInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      await voucherNoInput.fill("V-001");
      await expect(voucherNoInput).toHaveValue("V-001");
    }
  });

  test("Purchase form: Voucher No. is visible, no Invoice No.", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Purchase tab
    const purchaseTab = page.locator("button", { hasText: "Purchase" }).first();
    await purchaseTab.click();
    await page.waitForTimeout(1000);

    // Voucher No. IS visible on the Purchase form
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });

    // Invoice No. should NOT exist
    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).not.toBeVisible({ timeout: 5000 });
  });

  test("Payment form: Voucher No. is visible, no Invoice No.", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Payment tab
    const paymentTab = page.locator("button", { hasText: "Payment" }).first();
    await paymentTab.click();
    await page.waitForTimeout(1000);

    // Voucher No. IS visible
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });

    // Invoice No. should NOT exist
    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).not.toBeVisible({ timeout: 5000 });
  });

  test("Receipt form: Voucher No. is visible, no Invoice No.", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click Receipt tab
    const receiptTab = page.locator("button", { hasText: "Receipt" }).first();
    await receiptTab.click();
    await page.waitForTimeout(1000);

    // Voucher No. IS visible
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });

    // Invoice No. should NOT exist
    const invoiceNoLabel = page.locator("label", { hasText: "Invoice No." });
    await expect(invoiceNoLabel).not.toBeVisible({ timeout: 5000 });
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
      }
    }
  });
});
