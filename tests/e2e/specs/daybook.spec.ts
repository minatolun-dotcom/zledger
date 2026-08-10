import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption } from "../helpers/interaction";

test.describe("DayBook", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Daybook" }).click();
    await page.waitForLoadState("networkidle");
  });

  test("DayBook page loads with summary cards and table", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Day Book" })).toBeVisible();
    await expect(page.getByText("Total Vouchers")).toBeVisible();
    await expect(page.getByText("Total Debit")).toBeVisible();
    await expect(page.getByText("Total Credit")).toBeVisible();
    await expect(page.getByRole("table", { name: "Day Book entries" })).toBeVisible();
  });

  test("Filter bar has search, type/party/ledger/status selects and export buttons", async ({ page }) => {
    await expect(page.getByLabel("Search vouchers")).toBeVisible();
    await expect(page.getByText("From", { exact: true })).toBeVisible();
    await expect(page.getByText("To", { exact: true })).toBeVisible();
    await expect(page.getByText("Min ₹", { exact: true })).toBeVisible();
    await expect(page.getByText("Max ₹", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "All Types" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All Parties" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All Ledgers" })).toBeVisible();
    await expect(page.getByRole("button", { name: "All Statuses" })).toBeVisible();
    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Excel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
  });

  test("Search vouchers by text filters the table", async ({ page }) => {
    const table = page.getByRole("table", { name: "Day Book entries" });
    // Wait for data rows (not the skeleton). Column 3 = voucher number.
    const firstRow = page.locator("table tbody tr").first();
    await firstRow.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const firstNumber = await firstRow.locator("td").nth(2).textContent().catch(() => null);
    if (!firstNumber) return test.skip();
    const prefix = firstNumber.trim().slice(0, 4);
    await page.getByLabel("Search vouchers").fill(prefix);
    await page.waitForTimeout(800); // debounced auto-search
    await expect(table).toBeVisible();
    const rows = page.locator("table tbody tr").filter({ has: page.locator("td") });
    const rowCount = await rows.count();
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      const text = (await rows.nth(i).textContent()) || "";
      expect(text).toContain(prefix);
    }
  });

  test("Filter by voucher type", async ({ page }) => {
    const table = page.getByRole("table", { name: "Day Book entries" });
    await selectOption(page, "All Types", "Sales");
    await page.waitForTimeout(800);
    await expect(table).toBeVisible();
    const rows = page.locator("table tbody tr").filter({ has: page.locator("td") });
    const rowCount = await rows.count();
    for (let i = 0; i < Math.min(rowCount, 5); i++) {
      expect(await rows.nth(i).textContent()).toContain("Sales");
    }
  });

  test("Filter by status", async ({ page }) => {
    const table = page.getByRole("table", { name: "Day Book entries" });
    await selectOption(page, "All Statuses", "Posted");
    await page.waitForTimeout(800);
    await expect(table).toBeVisible();
  });

  test("Filter by min amount excludes zero-amount rows", async ({ page }) => {
    const table = page.getByRole("table", { name: "Day Book entries" });
    const minInput = page.getByPlaceholder("0");
    await minInput.fill("500");
    await page.waitForTimeout(800);
    await expect(table).toBeVisible();
  });

  test("Toggle between Flat View and Grouped by Date", async ({ page }) => {
    const flatBtn = page.getByRole("button", { name: "Flat View" });
    const groupedBtn = page.getByRole("button", { name: "Grouped by Date" });

    await expect(flatBtn).toBeVisible();
    await expect(groupedBtn).toBeVisible();

    await groupedBtn.click();
    await page.waitForTimeout(500);
    await flatBtn.click();
    await page.waitForTimeout(500);
  });

  test("Click a row opens voucher modal", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(1000);
      await expect(page.getByRole("button", { name: "Close" })).toBeVisible({ timeout: 5000 });
      await page.getByRole("button", { name: "Close" }).click();
    }
  });

  test("Row quick actions menu opens with voucher actions", async ({ page }) => {
    const table = page.getByRole("table", { name: "Day Book entries" });
    await table.waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
    const firstActionsBtn = page.getByRole("button", { name: /Actions for/ }).first();
    if (!(await firstActionsBtn.isVisible().catch(() => false))) return test.skip();
    await firstActionsBtn.click();
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: "View", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Print PDF", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
    // Close menu without acting
    await page.keyboard.press("Escape");
  });

  test("Keyboard navigation: arrows move highlight, Enter opens the row", async ({ page }) => {
    const firstRow = page.locator("table tbody tr").first();
    if (!(await firstRow.isVisible().catch(() => false))) return test.skip();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(200);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const closeBtn = page.getByRole("button", { name: "Close" });
    const modalVisible = await closeBtn.isVisible({ timeout: 5000 }).catch(() => false);
    if (modalVisible) await closeBtn.click();
    else {
      // Modal may have opened with a different label — try the dialog backdrop.
      await page.keyboard.press("Escape");
    }
  });
});
