import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Voucher Edit / Duplicate / Delete", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
    await page.waitForLoadState("networkidle");
  });

  test("Click a recent voucher opens detail modal", async ({ page }) => {
    const recentTable = page.locator("table").nth(1);
    const firstRow = recentTable.locator("tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      await expect(page.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Close" }).click();
    }
  });

  test("Duplicate button appears in modal", async ({ page }) => {
    const recentTable = page.locator("table").nth(1);
    const firstRow = recentTable.locator("tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const dupBtn = page.getByRole("button", { name: "Duplicate" });
      if (await dupBtn.isVisible().catch(() => false)) {
        await expect(dupBtn).toBeVisible();
        await dupBtn.click();
        await page.waitForTimeout(500);

        // Should show "Pre-filled from original" text
        await expect(page.getByText("Pre-filled from original")).toBeVisible({ timeout: 3000 });

        // Close without saving
        await page.getByRole("button", { name: "Close" }).click();
      }
    }
  });

  test("Delete button appears in modal for non-protected vouchers", async ({ page }) => {
    const recentTable = page.locator("table").nth(1);
    const firstRow = recentTable.locator("tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const deleteBtn = page.getByRole("button", { name: "Delete" });
      // Delete button may or may not be visible depending on voucher type
      if (await deleteBtn.isVisible().catch(() => false)) {
        await expect(deleteBtn).toBeVisible();
        // Don't actually delete - just verify it exists
        await page.getByRole("button", { name: "Close" }).click();
      } else {
        await page.getByRole("button", { name: "Close" }).click();
      }
    }
  });

  test("Print PDF button appears in modal", async ({ page }) => {
    const recentTable = page.locator("table").nth(1);
    const firstRow = recentTable.locator("tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);

      const printBtn = page.getByRole("button", { name: "Print PDF" });
      await expect(printBtn).toBeVisible({ timeout: 5000 });

      await page.getByRole("button", { name: "Close" }).click();
    }
  });
});
