import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption, fillDate, selectVoucherType, saveVoucher } from "../helpers/interaction";
import { PARTIES, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";

const RUN_ID = Date.now();

// ── Helpers ────────────────────────────────────────────────────────────────

async function openDaybook(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Daybook" }).click();
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: "Day Book" })).toBeVisible();
}

async function searchDaybook(page: Page, text: string) {
  await page.getByPlaceholder("Search voucher #, party, narration...").fill(text);
  await page.waitForTimeout(1200); // 300ms debounce + fetch
}

/** Blur the search input so document-level keyboard nav takes over. */
async function blurSearch(page: Page) {
  await page.getByRole("heading", { name: "Day Book" }).click();
  await page.waitForTimeout(150);
}

function daybookRow(page: Page, text: string) {
  return page.locator("tbody tr", { hasText: text });
}

test.describe("Day Book — keyboard workflow", () => {
  test.describe.configure({ mode: "serial" });

  const narration = `${E2E_PREFIX} DBK ${RUN_ID}`;

  test("1. Setup: create a payment voucher with a distinctive narration", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
    await selectVoucherType(page, "Payment");
    await fillDate(page, "2026-07-05");
    await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
    await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} DBK-${RUN_ID}`);
    await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
    await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("5000");
    await page.getByPlaceholder("Narration...").fill(narration);
    await saveVoucher(page, "Save");
    await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });
  });

  test("2. Search by narration narrows to the row; Clear restores the list", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    await searchDaybook(page, narration);
    await expect(daybookRow(page, narration).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator("tbody tr")).toHaveCount(1, { timeout: 5000 });

    // Clear search via the ✕ button → full list returns
    await page.getByRole("button", { name: "Clear search" }).click();
    await page.waitForTimeout(1200);
    expect(await page.locator("tbody tr").count()).toBeGreaterThan(1);
  });

  test("3. From/To date range includes then excludes the voucher", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    // Voucher is dated 2026-07-05. Range covering it → row visible.
    await page.getByPlaceholder("dd/mm/yyyy").nth(0).fill("01/07/2026");
    await page.getByPlaceholder("dd/mm/yyyy").nth(1).fill("31/07/2026");
    await page.waitForTimeout(1200);
    await expect(daybookRow(page, narration).first()).toBeVisible({ timeout: 8000 });

    // Tighten To before the voucher date → it disappears.
    await page.getByPlaceholder("dd/mm/yyyy").nth(1).fill("04/07/2026");
    await page.waitForTimeout(1200);
    await expect(daybookRow(page, narration)).toHaveCount(0, { timeout: 8000 });
  });

  test("4. Party filter narrows to the party's rows", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    await selectOption(page, "All Parties", PARTIES.globalDistributors);
    await page.waitForTimeout(1200);
    await expect(daybookRow(page, narration).first()).toBeVisible({ timeout: 8000 });
  });

  test("5. ArrowDown highlights the row; Enter opens the exact voucher; Escape closes", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    // Narrow to exactly our voucher
    await searchDaybook(page, narration);
    const row = daybookRow(page, narration).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await blurSearch(page);

    // ArrowDown highlights the first (only) row
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    const rowClass = (await row.getAttribute("class")) || "";
    expect(rowClass).toContain("ring-1");

    // Enter opens the highlighted voucher
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveCount(1, { timeout: 5000 });
    await expect(dialog.getByPlaceholder("Narration...")).toHaveValue(narration);

    // Escape closes the modal
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
  });

  test("6. Quick-edit: open via Enter, edit narration, Update persists in Day Book", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    await searchDaybook(page, narration);
    await expect(daybookRow(page, narration).first()).toBeVisible({ timeout: 8000 });
    await blurSearch(page);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveCount(1, { timeout: 5000 });

    const updated = `${narration} EDITED`;
    await dialog.getByPlaceholder("Narration...").fill(updated);
    await dialog.getByRole("button", { name: "Update", exact: true }).click();
    await page.waitForTimeout(1200);

    // Close and confirm the new narration is searchable
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
    await searchDaybook(page, updated);
    await expect(daybookRow(page, updated).first()).toBeVisible({ timeout: 8000 });
  });

  test("7. Grouped by Date view: keyboard still opens the highlighted row", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    await page.getByRole("button", { name: "Grouped by Date" }).click();
    await page.waitForTimeout(1200);
    // Test 6 renamed the narration — use the current value for a unique match
    const current = `${narration} EDITED`;
    await searchDaybook(page, current);
    const row = daybookRow(page, current).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await blurSearch(page);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(1000);
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toHaveCount(1, { timeout: 5000 });
    await expect(dialog.getByPlaceholder("Narration...")).toHaveValue(current);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0, { timeout: 5000 });
  });

  test("8. Escape clears the highlight without opening anything", async ({ page }) => {
    await loginAsAdmin(page);
    await openDaybook(page);

    await searchDaybook(page, narration);
    const row = daybookRow(page, narration).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await blurSearch(page);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    expect((await row.getAttribute("class")) || "").toContain("ring-1");

    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect((await row.getAttribute("class")) || "").not.toContain("ring-1");
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });
});
