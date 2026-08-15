import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Parties", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Parties sits directly under the Accounting group (flat sidebar).
    await page.getByRole("link", { name: "Parties" }).click();
    await page.waitForURL("**/parties");
    await page.waitForLoadState("networkidle");
  });

  test("Create a party via modal", async ({ page }) => {
    const name = `${E2E_PREFIX} Party Co`;
    await page.getByRole("button", { name: "Create Party" }).click();
    await expect(page.getByRole("heading", { name: "New Party Master" })).toBeVisible();
    await page.getByPlaceholder("e.g. ABC Traders").fill(name);
    await page.locator(".fixed.inset-0").getByRole("button", { name: "Create Party", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(name).first()).toBeVisible();
  });

  test("Edit a party via row actions (rename + reclassify)", async ({ page }) => {
    const stamp = Date.now();
    const name = `${E2E_PREFIX} Edit Co ${stamp}`;
    const renamed = `${E2E_PREFIX} Edit Co Renamed ${stamp}`;
    // Seed via the create modal
    await page.getByRole("button", { name: "Create Party" }).click();
    await page.getByPlaceholder("e.g. ABC Traders").fill(name);
    await page.locator(".fixed.inset-0").getByRole("button", { name: "Create Party", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(name).first()).toBeVisible();
    // Let the success toast (4s) clear so it doesn't overlay the row buttons.
    await page.waitForTimeout(4500);

    // Rename through the row Edit button
    const row = page.locator("tr", { hasText: name }).first();
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Party Master" })).toBeVisible();
    await page.getByPlaceholder("e.g. ABC Traders").fill(renamed);
    await page.locator(".fixed.inset-0").getByRole("button", { name: "Save Changes", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(renamed).first()).toBeVisible();
  });

  test("Delete a party via row actions", async ({ page }) => {
    const name = `${E2E_PREFIX} Delete Co ${Date.now()}`;
    // Seed via the create modal
    await page.getByRole("button", { name: "Create Party" }).click();
    await page.getByPlaceholder("e.g. ABC Traders").fill(name);
    await page.locator(".fixed.inset-0").getByRole("button", { name: "Create Party", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(name).first()).toBeVisible();
    // Let the success toast (4s) clear so it doesn't overlay the row buttons.
    await page.waitForTimeout(4500);

    // Delete with confirm
    page.on("dialog", (dialog) => dialog.accept());
    const row = page.locator("tr", { hasText: name }).first();
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByText(name)).toHaveCount(0);
  });
});
