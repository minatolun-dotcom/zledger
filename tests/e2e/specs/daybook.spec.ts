import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("DayBook", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Daybook" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("DayBook page loads with summary cards and table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Day Book" })).toBeVisible();
    await expect(page.getByText("Total Vouchers")).toBeVisible();
    await expect(page.getByText("Total Debit")).toBeVisible();
    await expect(page.getByText("Total Credit")).toBeVisible();
    await expect(page.getByRole("table", { name: "Day Book entries" })).toBeVisible();
  });

  test("Filter bar has search and export buttons", async ({ page }) => {
    await expect(page.getByLabel("Search vouchers")).toBeVisible();
    await expect(page.getByRole("button", { name: "Search", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
  });

  test("Search vouchers by text", async ({ page }) => {
    await page.getByLabel("Search vouchers").fill("INV");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("table", { name: "Day Book entries" })).toBeVisible();
  });

  test("Toggle between Flat View and Grouped by Date", async ({ page }) => {
    const flatBtn = page.getByRole("button", { name: "Flat View" });
    const groupedBtn = page.getByRole("button", { name: "Grouped by Date" });

    await expect(flatBtn).toBeVisible();
    await expect(groupedBtn).toBeVisible();

    await groupedBtn.click();
    await page.waitForTimeout(500);
    await flatBtn.click();
    await page.waitForTimeout(500);
  });

  test("Click a row opens voucher modal", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await expect(page.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Close" }).click();
    }
  });
});
