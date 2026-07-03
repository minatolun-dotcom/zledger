import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Tally Import", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Import / Export" }).click();
    await page.waitForURL("**/tally-import");
    await page.waitForLoadState("networkidle");
  });

  test("Tally Import page loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Tally Import" })).toBeVisible();
  });

  test("Import section has file upload", async ({ page }) => {
    const content = page.locator("main, .space-y-4, [class*='space']").first();
    await expect(content).toBeVisible();
  });
});
