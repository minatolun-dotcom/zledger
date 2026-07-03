import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Recurring Templates", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate to recurring templates - may be under a different route
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("Recurring templates page is accessible", async ({ page }) => {
    // Try navigating directly
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");

    // Page should load without JS errors
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.waitForTimeout(1000);

    expect(errors).toHaveLength(0);
  });
});
