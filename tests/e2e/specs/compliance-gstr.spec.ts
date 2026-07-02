import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GSTR-1 and GSTR-3B Return Generation", () => {
  test.beforeEach(async ({ page }) => {
    // Collect JS console errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("GSTR-3B generates and shows outward supplies + ITC", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "+ Generate Return" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByText("3.1 — Outward Supplies")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("4 — Eligible ITC")).toBeVisible({ timeout: 5000 });
  });

  test("GSTR-1 generates and shows detail view", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "+ Generate Return" }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "GSTR-3B (Monthly)" }).click();
    await page.waitForTimeout(300);
    await page.locator("div").filter({ hasText: "GSTR-1 (Monthly)" }).last().click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "Generate" }).click();
    await page.waitForTimeout(3000);

    // Check errors
    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }

    // Check page content
    const text = await page.evaluate(() => document.body.innerText);
    expect(text.length).toBeGreaterThan(0);

    // Verify detail view is shown
    await expect(page.getByRole("button", { name: "← Back to returns" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "B2B" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Total Tax")).toBeVisible({ timeout: 5000 });
  });
});
