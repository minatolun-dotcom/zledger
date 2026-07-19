import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GST Compliance Status", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Compliance page loads with heading", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: /Statutory Compliance/i })).toBeVisible();
  });

  test("GST Status tab shows return filing status", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "GST Status" }).click();
    await page.waitForTimeout(800);
    // The GST status view lists the standard returns with a filing state badge.
    await expect(page.getByText(/GSTR-1 \(Outward\)/i)).toBeVisible();
    await expect(page.getByText(/GSTR-3B \(Monthly\)/i)).toBeVisible();
    await expect(page.getByText(/GSTR-9 \(Annual\)/i)).toBeVisible();
    // Each return shows a generated / not-generated badge.
    const generated = page.getByText(/Generated ✓/i);
    const notGenerated = page.getByText(/Not generated/i);
    const hasAny = (await generated.count()) + (await notGenerated.count());
    expect(hasAny).toBeGreaterThan(0);
  });

  test("GST Status shows a filing-state badge per return", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "GST Status" }).click();
    await page.waitForTimeout(800);
    // Each return renders either a "Generated" or "Not generated" badge.
    const generated = page.getByText(/Generated ✓/i);
    const notGenerated = page.getByText(/Not generated/i);
    expect((await generated.count()) + (await notGenerated.count())).toBeGreaterThanOrEqual(3);
  });
});
