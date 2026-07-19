import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Company Settings — Non-Logo Fields", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Company Settings" }).click();
    await page.waitForURL("**/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
  });

  test("Company Settings page loads with all sections", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Company Settings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Company Logo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    // Bank Details lives under the "Contact & Bank" tab.
    await page.getByRole("button", { name: "Contact & Bank", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bank Details" })).toBeVisible();
  });

  test("Company details form has all fields", async ({ page }) => {
    await page.getByRole("button", { name: "Tax", exact: true }).click();
    await expect(page.getByPlaceholder("27AAAAA1111A1Z5", { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("AAAAA1111A", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Contact & Bank", exact: true }).click();
    await expect(page.getByPlaceholder("+91 98765 43210")).toBeVisible();
    await expect(page.getByPlaceholder("info@company.com")).toBeVisible();
    await expect(page.getByPlaceholder("https://company.com")).toBeVisible();
  });

  test("Bank details form has all fields", async ({ page }) => {
    await page.getByRole("button", { name: "Contact & Bank", exact: true }).click();
    await expect(page.getByPlaceholder("State Bank of India")).toBeVisible();
    await expect(page.getByPlaceholder("1234567890")).toBeVisible();
    await expect(page.getByPlaceholder("SBIN0001234")).toBeVisible();
    await expect(page.getByPlaceholder("Main Branch")).toBeVisible();
  });

  test("Save company details", async ({ page }) => {
    await page.getByRole("button", { name: "Contact & Bank", exact: true }).click();
    const phoneInput = page.getByPlaceholder("+91 98765 43210");
    await phoneInput.fill("9876543210");

    await page.getByRole("button", { name: "Save Changes" }).click();
    await page.waitForTimeout(2000);

    await expect(page.getByText("Company details updated")).toBeVisible({ timeout: 5000 });
  });
});
