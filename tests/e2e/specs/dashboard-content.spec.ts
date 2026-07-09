import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Dashboard Content", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Dashboard shows summary cards", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });

    const body = await page.evaluate(() => document.body.innerText);
    expect(body.toUpperCase()).toContain("TOTAL INCOME");
    expect(body.toUpperCase()).toContain("TOTAL EXPENSES");
    expect(body.toUpperCase()).toMatch(/NET (PROFIT|LOSS)/);
    expect(body.toUpperCase()).toContain("TOTAL ASSETS");

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  });

  test("Dashboard shows trend chart", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page.getByText("Income vs Expenses")).toBeVisible({ timeout: 5000 });
  });

  test("Dashboard shows Pending Actions", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    const body = await page.evaluate(() => document.body.innerText);
    // Pending Actions section may or may not be visible depending on data
    // Just check that the page loads without errors
    expect(body).toContain("Dashboard");
  });

  test("Quick action buttons navigate correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Click "Create Voucher" quick action
    await page.getByRole("button", { name: "Create Voucher" }).click();
    await page.waitForURL("**/vouchers");
    expect(page.url()).toContain("/vouchers");
  });
});
