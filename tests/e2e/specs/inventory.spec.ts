import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Inventory — Stock Groups, Items, Entries", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Stock & Inventory" }).click();
    await page.waitForURL("**/inventory");
    await page.waitForLoadState("networkidle");
  });

  test("Inventory page loads with three tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Stock Groups", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Stock Items", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Stock Entries", exact: true })).toBeVisible();
  });

  test("Create a new stock group", async ({ page }) => {
    await page.getByRole("button", { name: "+ New Group" }).click();
    await page.waitForTimeout(300);

    // Modal opens - fill name field (first input in modal)
    const modal = page.locator(".fixed.inset-0");
    const nameInput = modal.locator("input[type='text']").first();
    await nameInput.fill(`${E2E_PREFIX} Test Group`);

    const descInput = modal.locator("input[type='text']").nth(1);
    await descInput.fill("E2E test group");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(`${E2E_PREFIX} Test Group`).first()).toBeVisible();
  });

  test("Edit a stock group", async ({ page }) => {
    const groupCard = page.getByText(`${E2E_PREFIX} Test Group`).first();
    await groupCard.click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");
    const descInput = modal.locator("input[type='text']").nth(1);
    await descInput.fill("Updated description");

    await modal.getByRole("button", { name: "Update" }).click();
    await page.waitForTimeout(1000);
  });

  test("Create a new stock item", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Items", exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Item" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");

    // Fill Name
    await modal.locator("input[type='text']").first().fill(`${E2E_PREFIX} Test Item`);

    // Fill SKU (second text input)
    await modal.locator("input[type='text']").nth(1).fill("E2E-SKU-001");

    // Fill HSN/SAC (third text input)
    await modal.locator("input[type='text']").nth(2).fill("9999");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(`${E2E_PREFIX} Test Item`).first()).toBeVisible();
  });

  test("Create a stock entry (inward)", async ({ page }) => {
    // "+ New Entry" button only appears when the Stock Entries tab is active
    await page.getByRole("tab", { name: "Stock Entries", exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Entry" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");

    // MasterSelector renders as <input role="combobox">, NOT a <select>
    const combobox = modal.locator('input[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300);
    // Pick the first non-empty option from the dropdown
    const firstOption = page.locator('[class*="overflow-auto"] [class*="cursor-pointer"]').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
      await page.waitForTimeout(300);
    }

    // Fill quantity and rate (number inputs)
    const qtyInput = modal.locator("input[type='number']").first();
    await qtyInput.fill("10");

    const rateInput = modal.locator("input[type='number']").nth(1);
    await rateInput.fill("100");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);
  });

  test("Delete a stock group", async ({ page }) => {
    const groupCard = page.getByText(`${E2E_PREFIX} Test Group`).first();
    if (await groupCard.isVisible().catch(() => false)) {
      await groupCard.click();
      await page.waitForTimeout(300);
      page.on("dialog", (dialog) => dialog.accept());
      const modal = page.locator(".fixed.inset-0");
      await modal.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);
    }
  });

  test("Delete a stock item", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Items", exact: true }).click();
    await page.waitForTimeout(300);

    const itemRow = page.getByText(`${E2E_PREFIX} Test Item`).first();
    if (await itemRow.isVisible().catch(() => false)) {
      await itemRow.click();
      await page.waitForTimeout(300);
      page.on("dialog", (dialog) => dialog.accept());
      const modal = page.locator(".fixed.inset-0");
      await modal.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);
    }
  });
});
