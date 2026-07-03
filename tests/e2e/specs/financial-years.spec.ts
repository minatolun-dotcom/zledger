import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Financial Years", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Financial Years" }).click();
    await page.waitForURL("**/financial-years");
    await page.waitForLoadState("networkidle");
  });

  test("Financial Years page loads with table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Financial Years" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ New Financial Year" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("Existing financial year is listed", async ({ page }) => {
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("Create form opens with all fields", async ({ page }) => {
    await page.getByRole("button", { name: "+ New Financial Year" }).click();

    await expect(page.getByRole("heading", { name: "New Financial Year" })).toBeVisible();
    await expect(page.getByPlaceholder("e.g. 2026-27")).toBeVisible();
    await expect(page.locator("input[placeholder*='dd']").first()).toBeVisible();
    await expect(page.locator("input[placeholder*='dd']").nth(1)).toBeVisible();
    await expect(page.getByRole("button", { name: "Create" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("Close and reopen a financial year", async ({ page }) => {
    const openBadge = page.locator("span").filter({ hasText: "Open" }).first();
    await expect(openBadge).toBeVisible();
    const openRow = openBadge.locator("xpath=ancestor::tr");
    await openRow.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(2000);

    await expect(page.locator("span").filter({ hasText: "Closed" }).first()).toBeVisible();

    const closedBadge = page.locator("span").filter({ hasText: "Closed" }).first();
    const closedRow = closedBadge.locator("xpath=ancestor::tr");
    await closedRow.getByRole("button", { name: "Reopen" }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator("span").filter({ hasText: "Open" }).first()).toBeVisible();
  });

  test("Edit a financial year name", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.getByRole("button", { name: "Edit" }).click();

    await expect(page.getByText("Edit Financial Year")).toBeVisible();
    const nameInput = page.getByPlaceholder("e.g. 2026-27");
    await expect(nameInput).toBeVisible();

    await nameInput.fill(`${E2E_PREFIX} FY Edited`);
    await page.getByRole("button", { name: "Update" }).click();
    await page.waitForTimeout(1000);
  });

  test("Delete a test financial year", async ({ page }) => {
    const testFy = page.getByText(`${E2E_PREFIX} FY Edited`).first();
    if (await testFy.isVisible().catch(() => false)) {
      const row = testFy.locator("xpath=ancestor::tr");
      await row.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(500);
      await row.getByRole("button", { name: "Confirm" }).click();
      await page.waitForTimeout(1000);
    }
  });
});
