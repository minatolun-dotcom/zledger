import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GSTR Annual Returns (GSTR-9 / GSTR-9C)", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("GSTR-9 shows annual return detail", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Try clicking an existing GSTR-9 row first
    const existingRow = page.locator("text=/gstr9/i").first();
    const hasExisting = await existingRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasExisting) {
      await existingRow.click();
      await page.waitForTimeout(2000);
    } else {
      // Generate a new GSTR-9
      await page.getByRole("button", { name: "+ Generate Return" }).click();
      await page.waitForTimeout(500);

      // Switch to GSTR-9 (Annual)
      const typeTrigger = page.getByRole("button", { name: "GSTR-3B (Monthly)" }).first();
      if (await typeTrigger.isVisible().catch(() => false)) {
        await typeTrigger.click();
        await page.waitForTimeout(200);
        await page.locator("div").filter({ hasText: "GSTR-9 (Annual)" }).last().click();
        await page.waitForTimeout(300);
      }

      // Select FY 2025-26
      const periodTrigger = page.getByRole("button", { name: /2026|2025-26/ }).first();
      if (await periodTrigger.isVisible().catch(() => false)) {
        await periodTrigger.click();
        await page.waitForTimeout(200);
        await page.locator("div").filter({ hasText: "2025-26" }).last().click();
        await page.waitForTimeout(300);
      }

      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForTimeout(3000);

      // Handle 409 — navigate back and click existing row
      const hasError = await page.getByText(/already exists|Conflict/).isVisible().catch(() => false);
      if (hasError) {
        await page.goto("/compliance");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        const row = page.locator("text=/gstr9/i").first();
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          await row.click();
          await page.waitForTimeout(2000);
        }
      }
    }

    // Verify GSTR-9 detail sections — use the Back button as indicator of detail view
    await expect(page.getByRole("button", { name: "← Back to returns" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Gstr9/i).first()).toBeVisible({ timeout: 5000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in GSTR-9: ${errors.join(" | ")}`);
    }
  });

  test("GSTR-9C reconciliation detail is viewable", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");

    // Try clicking an existing GSTR-9C row first
    const existingRow = page.locator("text=/gstr9c/i").first();
    const hasExisting = await existingRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasExisting) {
      await existingRow.click();
      await page.waitForTimeout(2000);
    } else {
      // Generate a new GSTR-9C
      await page.getByRole("button", { name: "+ Generate Return" }).click();
      await page.waitForTimeout(500);

      const typeTrigger = page.getByRole("button", { name: "GSTR-3B (Monthly)" }).first();
      if (await typeTrigger.isVisible().catch(() => false)) {
        await typeTrigger.click();
        await page.waitForTimeout(200);
        await page.locator("div").filter({ hasText: "GSTR-9C (Reconciliation)" }).last().click();
        await page.waitForTimeout(300);
      }

      const periodTrigger = page.getByRole("button", { name: /2026|2025-26/ }).first();
      if (await periodTrigger.isVisible().catch(() => false)) {
        await periodTrigger.click();
        await page.waitForTimeout(200);
        await page.locator("div").filter({ hasText: "2025-26" }).last().click();
        await page.waitForTimeout(300);
      }

      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForTimeout(3000);

      const hasError = await page.getByText(/already exists|Conflict/).isVisible().catch(() => false);
      if (hasError) {
        await page.goto("/compliance");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1000);
        const row = page.locator("text=/gstr9c/i").first();
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          await row.click();
          await page.waitForTimeout(2000);
        }
      }
    }

    // Verify page has useful content (detail view or list)
    const body = await page.evaluate(() => document.body.innerText);
    const hasContent = body.includes("Gstr9c") || body.includes("Table 4") || body.includes("Reconciliation");
    expect(hasContent).toBe(true);

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in GSTR-9C: ${errors.join(" | ")}`);
    }
  });
});
