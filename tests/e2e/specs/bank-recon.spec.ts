import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Bank Reconciliation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/bank-reconciliation");
    await page.waitForLoadState("networkidle");
  });

  test("shows only bank ledgers in the dropdown", async ({ page }) => {
    await page.getByRole("button", { name: "Select a bank ledger" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("HDFC Bank - Current A/c")).toBeVisible({ timeout: 5000 });
    const cashDivs = page.locator("div").filter({ hasText: /^Cash$/ });
    const salesDivs = page.locator("div").filter({ hasText: /^Sales$/ });
    await expect(cashDivs).toHaveCount(0);
    await expect(salesDivs).toHaveCount(0);
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Bank Reconciliation/i })).toBeVisible();
  });

  test("import CSV button appears after selecting ledger", async ({ page }) => {
    await page.getByRole("button", { name: "Select a bank ledger" }).click();
    await page.waitForTimeout(500);
    await page.getByText("HDFC Bank - Current A/c").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page.getByRole("button", { name: /import/i })).toBeVisible();
  });

  test("ledger selector opens and shows bank options", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Select a bank ledger" });
    await btn.click();
    await page.waitForTimeout(500);
    // At least one option should be visible
    const options = page.locator("[role='option'], div[class*='cursor-pointer']").filter({ hasText: /bank/i });
    await expect(options.first()).toBeVisible({ timeout: 5000 });
  });

  test("selecting a ledger loads statement lines", async ({ page }) => {
    await page.getByRole("button", { name: "Select a bank ledger" }).click();
    await page.waitForTimeout(500);
    await page.getByText("HDFC Bank - Current A/c").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Summary section or empty state should appear
    const summaryVisible = await page.getByText(/unreconciled/i).isVisible().catch(() => false);
    const emptyVisible = await page.getByText(/no statement lines/i).isVisible().catch(() => false);
    expect(summaryVisible || emptyVisible).toBeTruthy();
  });
});
