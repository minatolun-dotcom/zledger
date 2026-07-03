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
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 10000 });

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("TOTAL INCOME");
    expect(body).toContain("TOTAL EXPENSES");
    expect(body).toContain("NET PROFIT");
    expect(body).toContain("TOTAL ASSETS");

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  });

  test("Dashboard shows Vouchers section with counts", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // "Vouchers" heading always shows (with count)
    await expect(page.getByText(/Vouchers.*total/)).toBeVisible({ timeout: 5000 });

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("Sales");
    expect(body).toContain("Purchase");
    expect(body).toContain("Masters");
    expect(body).toContain("Ledgers");
    expect(body).toContain("Parties");
  });

  test("Dashboard shows voucher type counts", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("Sales");
    expect(body).toContain("Purchase");
    expect(body).toContain("Receipt");
    expect(body).toContain("Payment");
  });

  test("Quick action buttons navigate correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Click "+ Create Voucher" quick action
    await page.getByRole("button", { name: "+ Create Voucher" }).click();
    await page.waitForURL("**/vouchers");
    expect(page.url()).toContain("/vouchers");
  });
});
