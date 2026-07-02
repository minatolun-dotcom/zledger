import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GST Challan / Payment Tracking", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Add a challan and verify it appears in the list", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Scroll to challan section and open form
    await page.getByText("Challans / Payments").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "+ Add Challan" }).click();
    await page.waitForTimeout(500);

    // Fill the challan form (last form on page)
    const form = page.locator("form").last();

    // challan_number (text input, nth 0)
    await form.locator("input").nth(0).fill("CPIN-E2E-TEST-001");
    // challan_date (date input, nth 1)
    await form.locator('input[type="date"]').fill("2026-07-01");
    // amount (number input, nth 0 of type=number)
    await form.locator('input[type="number"]').nth(0).fill("50000");
    // cgst_amount (number input, nth 1)
    await form.locator('input[type="number"]').nth(1).fill("25000");
    // sgst_amount (number input, nth 2)
    await form.locator('input[type="number"]').nth(2).fill("25000");
    // bank_name (text input, nth 9 overall)
    await form.locator("input").nth(9).fill("SBI Bank");
    // payment_mode (text input, nth 10 overall)
    await form.locator("input").nth(10).fill("Net Banking");
    await page.waitForTimeout(300);

    await form.getByRole("button", { name: "Save Challan" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after saving challan: ${errors.join(" | ")}`);
    }

    // Verify challan appears in the table
    await expect(page.getByText("CPIN-E2E-TEST-001").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("unapplied").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("SBI Bank").first()).toBeVisible({ timeout: 3000 });
  });

  test("Challan apply-to-return flow", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Scroll to challan section and add a new challan
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "+ Add Challan" }).click();
    await page.waitForTimeout(500);

    const form = page.locator("form").last();
    await form.locator("input").nth(0).fill("CPIN-E2E-APPLY-001");
    await form.locator('input[type="date"]').fill("2026-07-02");
    await form.locator('input[type="number"]').nth(0).fill("30000");
    await form.locator('input[type="number"]').nth(1).fill("15000");
    await form.locator('input[type="number"]').nth(2).fill("15000");
    await page.waitForTimeout(300);

    await form.getByRole("button", { name: "Save Challan" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after save: ${errors.join(" | ")}`);
    }

    // Verify challan appears with unapplied status
    await expect(page.getByText("CPIN-E2E-APPLY-001").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("unapplied").first()).toBeVisible({ timeout: 3000 });

    // Try to apply to a return if a select dropdown is available
    const applySelect = page.locator("select").last();
    const hasApplyOption = await applySelect.isVisible().catch(() => false);
    if (hasApplyOption) {
      const optionCount = await applySelect.locator("option").count();
      if (optionCount > 1) {
        await applySelect.selectOption({ index: 1 });
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        await expect(page.getByText("applied").first()).toBeVisible({ timeout: 5000 });
      }
    }
  });

  test("Return detail view loads without JS errors", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Generate a return if none exists
    const returnRow = page.locator("table").first().locator("tbody tr").first();
    const hasReturn = await returnRow.isVisible().catch(() => false);
    if (!hasReturn) {
      await page.getByRole("button", { name: "+ Generate Return" }).click();
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
    }

    // If generated just now we are in detail view, back to list
    const backBtn = page.getByRole("button", { name: "← Back to returns" });
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);
    }

    // Click first return to open detail
    await page.locator("table").first().locator("tbody tr").first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in return detail: ${errors.join(" | ")}`);
    }

    await expect(page.getByRole("button", { name: "← Back to returns" })).toBeVisible({ timeout: 5000 });
  });
});
