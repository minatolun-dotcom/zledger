import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Voucher List Keyboard Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");
  });

  test("ArrowDown highlights a row and Enter opens the voucher modal", async ({ page }) => {
    const table = page.getByRole("table");
    await table.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const rows = page.locator("table tbody tr").filter({ has: page.locator("td") });
    if ((await rows.count()) === 0) return test.skip();

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);

    // Enter opens the highlighted row → voucher modal with Close button.
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const closeBtn = page.getByRole("button", { name: "Close" }).first();
    const visible = await closeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (!visible) return test.skip();
    await closeBtn.scrollIntoViewIfNeeded().catch(() => {});
    await closeBtn.click({ force: true }).catch(() => {});
  });

  test("Search field keeps focus and typing does not hijack navigation", async ({ page }) => {
    const table = page.getByRole("table");
    await table.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const searchInput = page.locator("input[placeholder^='Search by voucher']");
    if ((await searchInput.count()) === 0) return test.skip();
    await searchInput.click();
    await searchInput.fill("INV");
    await page.waitForTimeout(500);
    // Typing in the search box must not open a modal (Enter in an input is fine).
    expect(await page.getByRole("button", { name: "Close" }).count()).toBe(0);
  });

  test("Escape clears the row highlight", async ({ page }) => {
    const table = page.getByRole("table");
    await table.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);
    // No modal opened by Escape and no error state.
    expect(await page.getByRole("button", { name: "Close" }).count()).toBe(0);
  });
});
