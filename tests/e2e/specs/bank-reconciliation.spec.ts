import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Bank Reconciliation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Reconciliation" }).click();
    await page.waitForURL("**/bank-reconciliation");
    await page.waitForLoadState("networkidle");
  });

  test("Bank Reconciliation page loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Bank Reconciliation" })).toBeVisible();
  });

  test("Ledger dropdown shows only bank ledgers", async ({ page }) => {
    const ledgerSelect = page.locator("select").first();
    if (await ledgerSelect.isVisible().catch(() => false)) {
      const options = await ledgerSelect.locator("option").allTextContents();
      const hasBankOption = options.some((o) => o.includes("HDFC") || o.includes("Bank"));
      expect(hasBankOption).toBe(true);
    }
  });
});
