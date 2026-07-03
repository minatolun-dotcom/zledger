import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("E-Invoice and E-Way Bill Pages", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("E-Invoice page loads", async ({ page }) => {
    await page.getByRole("link", { name: "E-Invoice" }).click();
    await page.waitForURL("**/einvoice");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "E-Invoice (GSTN IRP)" })).toBeVisible();
  });

  test("E-Way Bill page loads", async ({ page }) => {
    await page.getByRole("link", { name: "E-Way Bill" }).click();
    await page.waitForURL("**/eway-bill");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "E-Way Bill (GSTN)" })).toBeVisible();
  });
});
