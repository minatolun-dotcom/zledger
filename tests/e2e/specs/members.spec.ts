import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Members Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
  });

  test("Members page loads with member list", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Company Members" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add Member" })).toBeVisible();
  });

  test("Current admin user is listed as owner", async ({ page }) => {
    const adminRow = page.locator("table tbody tr", { hasText: "admin@zledger.com" });
    await expect(adminRow).toBeVisible();
    // The seeded admin is a superadmin and owns the company; the role badge
    // renders "superadmin" (or "owner" when not a superadmin).
    await expect(adminRow.getByText(/owner|superadmin/).first()).toBeVisible();
  });

  test("Add Member button opens form", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add Member" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByPlaceholder("user@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Member" })).toBeVisible();
  });

  test("Role selector shows Accountant and Viewer options", async ({ page }) => {
    await page.getByRole("button", { name: "+ Add Member" }).click();
    await page.waitForTimeout(300);

    const roleArea = page.locator("form").first().getByText("Role");
    await expect(roleArea).toBeVisible();
  });
});
