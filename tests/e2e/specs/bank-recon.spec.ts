import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Bank Reconciliation Ledger Filter", () => {
  test("shows only bank ledgers in the dropdown", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/bank-reconciliation");
    await page.waitForLoadState("networkidle");

    // Click the ledger selector trigger
    await page.getByRole("button", { name: "Select a bank ledger" }).click();
    await page.waitForTimeout(500);

    // Verify a known bank ledger appears in the options
    await expect(page.getByText("HDFC Bank - Current A/c")).toBeVisible({ timeout: 5000 });

    // Verify non-bank ledgers like "Cash" and "Sales" do not appear as options
    // by checking they are not inside any clickable option div in the portal
    const cashDivs = page.locator("div").filter({ hasText: /^Cash$/ });
    const salesDivs = page.locator("div").filter({ hasText: /^Sales$/ });
    await expect(cashDivs).toHaveCount(0);
    await expect(salesDivs).toHaveCount(0);
  });
});
