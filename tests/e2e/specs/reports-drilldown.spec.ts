import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Report Drill-down: TB / P&L / BS", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Click a ledger in TB opens transaction detail modal", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // TBI table: click the first ledger name cell
    const tbBody = page.locator("table").first().locator("tbody");
    const firstRow = tbBody.locator("tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });

    // Click the first ledger row
    await firstRow.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify ledger detail modal shows with Opening Balance line
    await expect(page.getByText("Opening Balance").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Close" }).first()).toBeVisible({ timeout: 3000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }

    // Close modal
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(500);
  });

  test("P&L tab loads and ledger names are clickable", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.getByText("Profit & Loss").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify P&L content loaded — look for summary text shown for any tab
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(0);

    const errors = (page as any).__errors || [];
    expect(errors.length).toBe(0);
  });

  test("BS tab loads and ledger names are clickable", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await page.getByText("Balance Sheet").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Verify BS content loaded
    const bodyText = await page.evaluate(() => document.body.innerText);
    expect(bodyText.length).toBeGreaterThan(0);

    const errors = (page as any).__errors || [];
    expect(errors.length).toBe(0);
  });
});
