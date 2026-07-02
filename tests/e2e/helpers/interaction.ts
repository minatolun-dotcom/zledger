import type { Page, Locator } from "@playwright/test";

/**
 * Click a custom Select trigger button by its placeholder or displayed text,
 * then pick the option with the given text from the portal dropdown.
 */
export async function selectOption(page: Page, triggerText: string, optionText: string) {
  const trigger = page.getByRole("button", { name: triggerText, exact: false });
  await trigger.click();
  await page.waitForTimeout(200);
  await page.locator("div").filter({ hasText: optionText }).last().click();
  await page.waitForTimeout(200);
}

/**
 * Fill a date input (accepts dd/mm/yyyy format).
 */
export async function fillDate(page: Page, isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  const display = `${d}/${m}/${y}`;
  const input = page.getByPlaceholder("dd/mm/yyyy");
  await input.fill(display);
  await input.press("Tab");
  await page.waitForTimeout(100);
}

/**
 * Click a voucher type tab on the vouchers page.
 */
export async function selectVoucherType(page: Page, shortLabel: string) {
  await page.getByRole("button", { name: shortLabel }).first().click();
  await page.waitForTimeout(300);
}

/**
 * Fill an item line (qty, rate) in ItemLineTable.
 * Assumes the first empty item line is available.
 */
export async function fillItemLine(page: Page, stockItem: string, qty: number, rate: number) {
  await selectOption(page, "Select...", stockItem);
  await page.waitForTimeout(200);

  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  const row = rows.last();

  const inputs = row.locator("input[type='number']");
  await inputs.nth(0).fill(String(qty));
  await inputs.nth(1).fill(String(rate));
}

/**
 * Fill a ledger line in JournalForm (ledger + debit/credit).
 */
export async function fillLedgerLine(page: Page, rowIndex: number, ledger: string, debit: number, credit: number) {
  const table = page.locator("table").first();
  const rows = table.locator("tbody tr");
  const row = rows.nth(rowIndex);

  const selectTrigger = row.getByRole("button", { name: /Select ledger|Select/i }).first();
  await selectTrigger.click();
  await page.waitForTimeout(200);
  await page.locator("div").filter({ hasText: ledger }).last().click();
  await page.waitForTimeout(200);

  const inputs = row.locator("input[type='number']");
  if (debit > 0) {
    await inputs.nth(0).fill(String(debit));
  }
  if (credit > 0) {
    await inputs.nth(1).fill(String(credit));
  }
}

/**
 * Save the current voucher form.
 */
export async function saveVoucher(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1000);
}
