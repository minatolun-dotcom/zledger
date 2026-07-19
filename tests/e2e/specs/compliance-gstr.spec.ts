import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GST Compliance Page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Compliance page loads with heading and Generate button", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /GST Compliance/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Generate Return/ })).toBeVisible();
  });

  test("Generate Return form opens", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Generate Return/ }).click();
    await expect(page.getByRole("button", { name: "Generate" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cancel/ })).toBeVisible();
  });

  test("Return type selector shows GSTR options", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /Generate Return/ }).click();
    // Default should show GSTR-3B
    await expect(page.getByRole("button", { name: /GSTR-3B/ })).toBeVisible();
  });

  test("Compliance returns list or empty state", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");
    const table = page.locator("table");
    const emptyState = page.getByText(/no.*return/i);
    const hasContent = await table.isVisible().catch(() => false) || await emptyState.isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test("GSTR-3B generates and shows outward supplies + ITC", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");

    // Wait for returns table to render
    await page.waitForTimeout(1000);

    // Try to find existing GSTR-3B in the table
    const existingRow = page.locator("tr").filter({ hasText: /gstr3b/i }).first();
    const hasExisting = await existingRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasExisting) {
      await existingRow.click();
      await page.waitForTimeout(1500);
    } else {
      // Generate a new return
      await page.getByRole("button", { name: "+ Generate Return" }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForTimeout(3000);

      // Handle 409 Conflict — navigate back and click existing
      const hasConflict = await page.getByText(/already exists/).isVisible().catch(() => false);
      if (hasConflict) {
        await page.goto("/gst?tab=compliance");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
        const row = page.locator("tr").filter({ hasText: /gstr3b/i }).first();
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          await row.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    await expect(page.getByText("3.1 — Outward Supplies")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("4 — Eligible ITC")).toBeVisible({ timeout: 5000 });
  });

  test("GSTR-1 generates and shows detail view", async ({ page }) => {
    await page.goto("/gst?tab=compliance");
    await page.waitForLoadState("networkidle");

    // Wait for returns table to render
    await page.waitForTimeout(1000);

    // Try to find existing GSTR-1 in the table
    const existingRow = page.locator("tr").filter({ hasText: /gstr1/i }).first();
    const hasExisting = await existingRow.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasExisting) {
      await existingRow.click();
      await page.waitForTimeout(1500);
    } else {
      // Generate a new GSTR-1 return
      await page.getByRole("button", { name: "+ Generate Return" }).click();
      await page.waitForTimeout(500);

      // Select GSTR-1 from the return type dropdown
      await page.locator("button").filter({ hasText: "GSTR-3B (Monthly)" }).first().click();
      await page.waitForTimeout(300);
      await page.getByText("GSTR-1 (Monthly)", { exact: true }).click();
      await page.waitForTimeout(500);

      await page.getByRole("button", { name: "Generate" }).click();
      await page.waitForTimeout(3000);

      // Handle 409 Conflict — navigate back and click existing
      const hasConflict = await page.getByText(/already exists/).isVisible().catch(() => false);
      if (hasConflict) {
        await page.goto("/gst?tab=compliance");
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1500);
        const row = page.locator("tr").filter({ hasText: /gstr1/i }).first();
        if (await row.isVisible({ timeout: 3000 }).catch(() => false)) {
          await row.click();
          await page.waitForTimeout(1500);
        }
      }
    }

    await expect(page.getByRole("button", { name: "← Back to returns" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "B2B" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Total Tax")).toBeVisible({ timeout: 5000 });
  });
});
