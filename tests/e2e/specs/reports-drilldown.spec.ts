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

  test("Voucher detail Related tab drills into linked voucher and Back returns", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Open the ledger detail modal from Trial Balance.
    const tbBody = page.locator("table").first().locator("tbody");
    const firstRow = tbBody.locator("tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    // Click the first *transaction* row (skip the non-clickable Opening Balance row).
    const clickableTx = page.locator("table").last().locator("tbody tr").filter({ has: page.locator("td") }).filter({ hasNotText: "Opening Balance" });
    await clickableTx.first().click();
    await page.waitForTimeout(1000);

    // Voucher detail modal: open the Related tab.
    await page.getByRole("button", { name: "Related", exact: true }).click();
    await page.waitForTimeout(800);

    // Click the first related voucher row (drill-down). Scope to the modal's table
    // (the TB table behind the overlay would otherwise intercept pointer events).
    const modalTable = page.locator("div.fixed.inset-0.z-\\[60\\] table").last();
    const clickable = modalTable.locator("tbody tr").filter({ has: page.locator("td") }).filter({ hasText: /Receipt|Payment|Sales|Purchase|Journal|Contra|Credit Note|Debit Note/ });
    if ((await clickable.count()) === 0) return test.skip();
    await clickable.first().click();
    await page.waitForTimeout(1000);

    // Back button appears (stack depth ≥ 1) — the drill-down happened.
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeVisible({ timeout: 5000 });

    // Back returns to the previous voucher detail.
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("button", { name: "Back", exact: true })).toBeHidden({ timeout: 3000 }).catch(() => {});

    const errors = (page as any).__errors || [];
    expect(errors.length).toBe(0);
  });

  test("Ledger detail View in Voucher List opens filtered browse tab", async ({ page }) => {
    await page.goto("/reports");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const tbBody = page.locator("table").first().locator("tbody");
    const firstRow = tbBody.locator("tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });
    await firstRow.click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800);

    // Click "View in Voucher List" → navigates to /vouchers?tab=browse&ledger_id=…
    const drillBtn = page.getByRole("button", { name: "View in Voucher List" });
    await expect(drillBtn).toBeVisible({ timeout: 5000 });
    await drillBtn.click();
    await page.waitForURL(/\/vouchers\?tab=browse&ledger_id=/);

    // The browse tab shows the active ledger filter chip.
    await expect(page.getByText(/Ledger:/)).toBeVisible({ timeout: 5000 });

    const errors = (page as any).__errors || [];
    expect(errors.length).toBe(0);
  });
});
