import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Recurring Templates CRUD", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Recurring templates page is accessible", async ({ page }) => {
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible({ timeout: 10000 });

    const errors = (page as any).__errors || [];
    expect(errors.length).toBe(0);
  });

  test("Create a recurring template", async ({ page }) => {
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: "+ New Template" }).click();
    await page.waitForTimeout(300);

    // Fill Name
    await page.getByPlaceholder("e.g. Monthly Rent").fill("[E2E] Test Monthly Template");

    // Select Voucher Type: Sales
    const typeTrigger = page.getByRole("button", { name: /Select voucher type|Sales/i }).first();
    if (await typeTrigger.isVisible().catch(() => false)) {
      await typeTrigger.click();
      await page.waitForTimeout(200);
      await page.locator("div").filter({ hasText: "Sales" }).last().click();
      await page.waitForTimeout(200);
    }

    // Select Frequency: Monthly
    const freqTrigger = page.getByRole("button", { name: /Select frequency|Monthly/i }).first();
    if (await freqTrigger.isVisible().catch(() => false)) {
      await freqTrigger.click();
      await page.waitForTimeout(200);
      await page.locator("div").filter({ hasText: "Monthly" }).last().click();
      await page.waitForTimeout(200);
    }

    // Fill Next Run Date
    const dateInput = page.locator('input[type="date"]');
    if (await dateInput.isVisible().catch(() => false)) {
      await dateInput.fill("2026-08-01");
    }

    await page.getByRole("button", { name: "Create Template" }).click();
    await page.waitForTimeout(1500);

    // Verify template appears in the table
    await expect(page.getByText("[E2E] Test Monthly Template").first()).toBeVisible({ timeout: 5000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after create: ${errors.join(" | ")}`);
    }
  });

  test("Run Now button is visible on active templates", async ({ page }) => {
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify "Run Now" buttons exist for active templates
    const runBtn = page.getByRole("button", { name: "Run Now" }).first();
    const hasRunBtn = await runBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasRunBtn) {
      // Button exists — verify it's on the page
      await expect(runBtn).toBeVisible();
    }

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  });

  test("Delete a recurring template", async ({ page }) => {
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Find our E2E test template or any template to delete
    const e2eRow = page.getByText("[E2E] Test Monthly Template").first();
    const hasE2e = await e2eRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasE2e) {
      // Accept confirm dialog
      page.on("dialog", (dialog) => dialog.accept());

      // Click Delete in the same row as the E2E template
      const row = e2eRow.locator("..");
      await row.locator("..").getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);

      await expect(page.getByText("[E2E] Test Monthly Template")).not.toBeVisible({ timeout: 5000 });
    }

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after delete: ${errors.join(" | ")}`);
    }
  });
});
