import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GST Pages (split)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("HSN / SAC page loads and shows heading", async ({ page }) => {
    await page.goto("/gst/hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "HSN / SAC Codes" })).toBeVisible();
    // table should render
    await expect(page.locator("table")).toBeVisible();
  });

  test("GST Registrations page loads and shows heading", async ({ page }) => {
    await page.goto("/gst/registrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "GST Registrations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add registration/i })).toBeVisible();
  });

  test("HSN/SAC page has add button", async ({ page }) => {
    await page.goto("/gst/hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /add hsn/i })).toBeVisible();
  });
});
