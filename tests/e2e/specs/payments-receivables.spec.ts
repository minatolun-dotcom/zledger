import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Payments & Receivables", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Payments & Receivables page loads with heading", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Payments & Receivables" })).toBeVisible({ timeout: 10000 });
  });

  test("Receivables tab shows data in table", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.getByText("Invoice #").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Party").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Amount").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Unpaid").first()).toBeVisible({ timeout: 3000 });

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("TOTAL OUTSTANDING");

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  });

  test("Payables tab switches correctly", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.getByRole("button", { name: /Payables/ }).click();
    await page.waitForTimeout(500);

    const body = await page.evaluate(() => document.body.innerText);
    expect(body).toContain("TOTAL OUTSTANDING");
  });

  test("Row click opens invoice detail modal", async ({ page }) => {
    await page.goto("/payments");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const table = page.locator("table").first();
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole("button", { name: "Record Payment" }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Payment Allocations").first()).toBeVisible({ timeout: 3000 });

    // Close modal by clicking backdrop
    const backdrop = page.locator(".fixed.inset-0.z-\\[99998\\]").first();
    if (await backdrop.isVisible().catch(() => false)) {
      await backdrop.click({ position: { x: 0, y: 0 } });
      await page.waitForTimeout(500);
    }

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in modal: ${errors.join(" | ")}`);
    }
  });
});
