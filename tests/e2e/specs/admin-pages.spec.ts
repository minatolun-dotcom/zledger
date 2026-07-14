import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Admin Pages", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Admin Users page loads with heading", async ({ page }) => {
    await page.goto("/admin/users");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "User Management" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "+ New User" }).first()).toBeVisible({ timeout: 5000 });
  });

  test("Admin Companies page loads with heading", async ({ page }) => {
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Company Management" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "+ New Company" }).first()).toBeVisible({ timeout: 5000 });
  });

  test("Audit Log page loads with heading", async ({ page }) => {
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible({ timeout: 10000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  });
});
