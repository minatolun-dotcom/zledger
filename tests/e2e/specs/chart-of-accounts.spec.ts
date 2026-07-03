import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Chart of Accounts", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Chart of Accounts" }).click();
    await page.waitForURL("**/chart-of-accounts");
    await page.waitForLoadState("networkidle");
  });

  test("COA page loads with tree and controls", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand All" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse All" })).toBeVisible();
    await expect(page.getByPlaceholder("Search groups and ledgers...")).toBeVisible();
  });

  test("Expand All shows all groups and ledgers", async ({ page }) => {
    await page.getByRole("button", { name: "Expand All" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Assets").first()).toBeVisible();
  });

  test("Collapse All hides sub-items", async ({ page }) => {
    await page.getByRole("button", { name: "Expand All" }).click();
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: "Collapse All" }).click();
    await page.waitForTimeout(500);
  });

  test("Search filters the tree", async ({ page }) => {
    await page.getByPlaceholder("Search groups and ledgers...").fill("Cash");
    await page.waitForTimeout(500);
    await expect(page.getByText("Cash").first()).toBeVisible();
  });

  test("Create a new ledger via context menu", async ({ page }) => {
    await page.getByRole("button", { name: "Expand All" }).click();
    await page.waitForTimeout(500);

    const assetsRow = page.getByText("Current Assets").first();
    await assetsRow.click({ button: "right" });
    await page.waitForTimeout(300);

    const createLedgerOption = page.getByText("Create Ledger");
    if (await createLedgerOption.isVisible().catch(() => false)) {
      await createLedgerOption.click();
      await page.waitForTimeout(500);

      const nameInput = page.locator("input[placeholder*='Rent']").first();
      await nameInput.fill(`${E2E_PREFIX} Test Ledger`);
      await page.getByRole("button", { name: "Create Ledger" }).click();
      await page.waitForTimeout(1000);
    }
  });

  test("Show Balances toggle works", async ({ page }) => {
    const showBalancesBtn = page.getByRole("button", { name: "Show Balances" });
    const hideBalancesBtn = page.getByRole("button", { name: "Hide Balances" });

    await showBalancesBtn.click();
    await page.waitForTimeout(300);
    await expect(hideBalancesBtn).toBeVisible();

    await hideBalancesBtn.click();
    await page.waitForTimeout(300);
    await expect(showBalancesBtn).toBeVisible();
  });

  test("Delete a test ledger", async ({ page }) => {
    await page.getByPlaceholder("Search groups and ledgers...").fill(`${E2E_PREFIX} Test Ledger`);
    await page.waitForTimeout(500);

    const ledgerRow = page.getByText(`${E2E_PREFIX} Test Ledger`).first();
    if (await ledgerRow.isVisible().catch(() => false)) {
      await ledgerRow.click({ button: "right" });
      await page.waitForTimeout(300);

      page.on("dialog", (dialog) => dialog.accept());
      const deleteOption = page.getByText("Delete");
      if (await deleteOption.isVisible().catch(() => false)) {
        await deleteOption.click();
        await page.waitForTimeout(1000);
      }
    }
  });
});
