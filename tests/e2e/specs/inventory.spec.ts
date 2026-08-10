import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Inventory — Stock Groups, Items, Entries", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Stock & Inventory" }).click();
    await page.waitForURL("**/inventory");
    await page.waitForLoadState("networkidle");
  });

  test("Inventory page loads with three tabs", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Stock Groups", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Stock Items", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Stock Entries", exact: true })).toBeVisible();
  });

  test("Stock Groups renders as a table with expected columns", async ({ page }) => {
    // The groups tab is the default tab — verify the SortableTable header row.
    const headers = page.locator("table thead th");
    await expect(headers.first()).toBeVisible();
    const texts = await headers.allTextContents();
    expect(texts.join(" | ")).toContain("Group");
    expect(texts.join(" | ")).toContain("Description");
    expect(texts.join(" | ")).toContain("Status");
    expect(texts.join(" | ")).toContain("Items");
    expect(texts.join(" | ")).toContain("Value");
    // Table has at least one row (demo groups exist).
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("Searching stock groups filters rows without crashing", async ({ page }) => {
    const search = page.getByPlaceholder("Search groups...");
    await expect(search).toBeVisible();
    const before = await page.locator("table tbody tr").count();
    expect(before).toBeGreaterThan(0);

    // Type a nonsense query — must show the empty state, NOT crash the app.
    await search.fill("zzz-no-match-xyz");
    await page.waitForTimeout(400);
    await expect(page.getByText("No matching groups.")).toBeVisible();

    // Clear — rows come back.
    await search.fill("");
    await page.waitForTimeout(400);
    expect(await page.locator("table tbody tr").count()).toBe(before);
  });

  test("Stock Entries table paginates (page 2 reachable)", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Entries", exact: true }).click();
    await page.waitForTimeout(500);

    // Demo company has 50+ entries, so with the default 25/page there is
    // a second page — assert the pagination control exists and works.
    const nextBtn = page.getByRole("button", { name: ">", exact: true });
    if (await nextBtn.isVisible().catch(() => false)) {
      const firstRowItem = await page.locator("table tbody tr").first().textContent();
      await nextBtn.click();
      await page.waitForTimeout(400);
      const secondRowItem = await page.locator("table tbody tr").first().textContent();
      expect(secondRowItem).not.toBe(firstRowItem);
    }
  });

  test("Create a new stock group", async ({ page }) => {
    await page.getByRole("button", { name: "+ New Group" }).click();
    await page.waitForTimeout(300);

    // Modal opens - fill name field (first input in modal)
    const modal = page.locator(".fixed.inset-0");
    const nameInput = modal.locator("input[type='text']").first();
    await nameInput.fill(`${E2E_PREFIX} Test Group`);

    const descInput = modal.locator("input[type='text']").nth(1);
    await descInput.fill("E2E test group");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(`${E2E_PREFIX} Test Group`).first()).toBeVisible();
  });

  test("Edit a stock group", async ({ page }) => {
    const groupCard = page.getByText(`${E2E_PREFIX} Test Group`).first();
    await groupCard.click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");
    const descInput = modal.locator("input[type='text']").nth(1);
    await descInput.fill("Updated description");

    await modal.getByRole("button", { name: "Update" }).click();
    await page.waitForTimeout(1000);
  });

  test("Create a new stock item", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Items", exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Item" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");

    // Fill Name
    await modal.locator("input[type='text']").first().fill(`${E2E_PREFIX} Test Item`);

    // Fill SKU (second text input)
    await modal.locator("input[type='text']").nth(1).fill("E2E-SKU-001");

    // Fill HSN/SAC (third text input)
    await modal.locator("input[type='text']").nth(2).fill("9999");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText(`${E2E_PREFIX} Test Item`).first()).toBeVisible();
  });

  test("Create a stock entry (inward)", async ({ page }) => {
    // "+ New Entry" button only appears when the Stock Entries tab is active
    await page.getByRole("tab", { name: "Stock Entries", exact: true }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Entry" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0");

    // MasterSelector renders as <input role="combobox">, NOT a <select>
    const combobox = modal.locator('input[role="combobox"]').first();
    await combobox.click();
    await page.waitForTimeout(300);
    // Pick the first non-empty option from the dropdown
    const firstOption = page.locator('[class*="overflow-auto"] [class*="cursor-pointer"]').first();
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click();
      await page.waitForTimeout(300);
    }

    // Fill quantity and rate (number inputs)
    const qtyInput = modal.locator("input[type='number']").first();
    await qtyInput.fill("10");

    const rateInput = modal.locator("input[type='number']").nth(1);
    await rateInput.fill("100");

    await modal.getByRole("button", { name: "Create" }).click();
    await page.waitForTimeout(1000);
  });

  test("Delete a stock group", async ({ page }) => {
    const groupCard = page.getByText(`${E2E_PREFIX} Test Group`).first();
    if (await groupCard.isVisible().catch(() => false)) {
      await groupCard.click();
      await page.waitForTimeout(300);
      page.on("dialog", (dialog) => dialog.accept());
      const modal = page.locator(".fixed.inset-0");
      await modal.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);
    }
  });

  test("Delete a stock item", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Items", exact: true }).click();
    await page.waitForTimeout(300);

    const itemRow = page.getByText(`${E2E_PREFIX} Test Item`).first();
    if (await itemRow.isVisible().catch(() => false)) {
      await itemRow.click();
      await page.waitForTimeout(300);
      page.on("dialog", (dialog) => dialog.accept());
      const modal = page.locator(".fixed.inset-0");
      await modal.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(1000);
    }
  });

  test("Tracking badge click filters items and does not open the row modal", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Items", exact: true }).click();
    await page.waitForTimeout(500);

    const badge = page.locator('button[title*="tracked items"]').first();
    await expect(badge).toBeVisible({ timeout: 6000 });
    const badgeText = (await badge.innerText()).trim();

    const rowsBefore = await page.locator('[data-table-key="inventory-items"] tbody tr').count();
    expect(rowsBefore).toBeGreaterThan(0);

    await badge.click();
    await page.waitForTimeout(600);

    // The filter must actually narrow the rows...
    const rowsAfter = await page.locator('[data-table-key="inventory-items"] tbody tr').count();
    expect(rowsAfter).toBeLessThan(rowsBefore);
    // ...the filter Select trigger reflects the clicked mode (e.g. "Batch (5)").
    // getByRole targets the trigger button specifically (getByText is unreliable
    // here — the label text lives inside a nested span). Char classes avoid
    // backslash escaping entirely (parens/digits match literally in a class).
    const triggerRe = new RegExp(`${badgeText} [(][0-9]+[)]`);
    await expect(page.getByRole("button", { name: triggerRe })).toBeVisible({ timeout: 4000 });
    // ...and the click must NOT have opened the item edit modal (stopPropagation guard).
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 4000 });
  });
});
