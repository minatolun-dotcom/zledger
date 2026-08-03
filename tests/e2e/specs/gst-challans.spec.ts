import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GST page tabs load without errors", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as Page & { __errors?: string[] }).__errors = errors;
  });

  test("GST page loads with its feature tabs", async ({ page }) => {
    await page.goto("/gst");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: "E-Invoice" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "E-Way Bill" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "HSN / SAC" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Registrations" })).toBeVisible();
  });

  test("HSN / SAC tab renders without JS errors", async ({ page }) => {
    await page.goto("/gst?tab=hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /HSN|HSN \/ SAC/i })).toBeVisible({ timeout: 5000 });

    const errors = (page as Page & { __errors?: string[] }).__errors || [];
    const realErrors = errors.filter(
      (e: string) => !/ERR_NETWORK_CHANGED|Failed to load resource/i.test(e)
    );
    if (realErrors.length > 0) {
      throw new Error(`JS errors on HSN/SAC tab: ${realErrors.join(" | ")}`);
    }
  });

  test("Registrations tab renders without JS errors", async ({ page }) => {
    await page.goto("/gst?tab=registrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("tab", { name: "Registrations" })).toBeVisible({ timeout: 5000 });

    const errors = (page as Page & { __errors?: string[] }).__errors || [];
    const realErrors = errors.filter(
      (e: string) => !/ERR_NETWORK_CHANGED|Failed to load resource/i.test(e)
    );
    if (realErrors.length > 0) {
      throw new Error(`JS errors on Registrations tab: ${realErrors.join(" | ")}`);
    }
  });
});
