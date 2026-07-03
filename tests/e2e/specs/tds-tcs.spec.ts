import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("TDS / TCS Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "TDS / TCS" }).click();
    await page.waitForURL("**/tds-tcs");
    await page.waitForLoadState("networkidle");
  });

  test("TDS/TCS page loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "TDS / TCS" })).toBeVisible();
  });

  test("Page has configuration sections", async ({ page }) => {
    const content = page.locator("main, .space-y-4, [class*='space']").first();
    await expect(content).toBeVisible();
  });
});
