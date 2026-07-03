import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Profile Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
  });

  test("Profile page loads with name and email fields", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
    await expect(page.getByText("Profile Information")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
  });

  test("Name and email fields are present", async ({ page }) => {
    const profileSection = page.locator("form").first();
    const nameInput = profileSection.locator("input[type='text']");
    const emailInput = profileSection.locator("input[type='email']");
    await expect(nameInput).toBeVisible();
    await expect(emailInput).toBeVisible();
  });

  test("Update profile shows success message", async ({ page }) => {
    const profileSection = page.locator("form").first();
    const nameInput = profileSection.locator("input[type='text']");
    const emailInput = profileSection.locator("input[type='email']");
    await nameInput.fill("Administrator");
    await emailInput.fill("admin@zledger.com");
    await page.getByRole("button", { name: "Update Profile" }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText("Profile updated")).toBeVisible({ timeout: 5000 });
  });

  test("Password change form has all fields", async ({ page }) => {
    const passwordForm = page.locator("form").nth(1);
    const passwordInputs = passwordForm.locator("input[type='password']");
    await expect(passwordInputs).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Change Password" })).toBeVisible();
  });
});
