import type { Page, Locator } from "@playwright/test";

/**
 * Click a custom Select or SearchableSelect trigger button by its placeholder or displayed text,
 * then pick the option with the given text from the portal dropdown.
 *
 * Also supports MasterSelector (the voucher forms' combobox input trigger): if a visible
 * input carries the trigger text as its placeholder, click it, type to filter, then pick
 * the matching option row.
 */
export async function selectOption(page: Page, triggerText: string, optionText: string, index = 0) {
  // MasterSelector combobox input path
  const combo = page.getByPlaceholder(triggerText).nth(index);
  const isCombo = await combo.isVisible({ timeout: 800 }).catch(() => false);
  if (isCombo) {
    // focus() opens the popup without the chevron button intercepting a click
    await combo.focus();
    await page.waitForTimeout(300);
    await combo.fill(optionText);
    await page.waitForTimeout(400);
    const option = page
      .locator("[data-master-popup] div.cursor-pointer", { hasText: optionText })
      .filter({ visible: true })
      .first();
    await option.click({ timeout: 5000 });
    await page.locator("[data-master-popup]").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
    return;
  }

  // Legacy custom Select / SearchableSelect button trigger
  const trigger = page.getByRole("button", { name: triggerText, exact: false }).first();
  await trigger.click();
  await page.waitForTimeout(300);

  // SearchableSelect shows a search input when opened. Scope to the VISIBLE one
  // so we never grab a stale (closed) dropdown's input from another control.
  const searchInput = page.locator("input[placeholder='Type to search...']:visible").first();
  const isSearchable = await searchInput.isVisible({ timeout: 1500 }).catch(() => false);

  if (isSearchable) {
    await searchInput.fill(optionText);
    await page.waitForTimeout(400);
    // Click the matching visible option (rendered as a div.cursor-pointer).
    const option = page
      .locator("div.cursor-pointer", { hasText: optionText })
      .filter({ visible: true })
      .first();
    await option.click({ timeout: 5000 });
    // Wait for the MasterSelector popup to close after selection
    await page.locator("[data-master-popup]").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  } else {
    // Custom Select portal: click the option text
    await page.getByText(optionText, { exact: false }).first().click({ timeout: 5000 });
    await page.locator("[data-master-popup]").waitFor({ state: "detached", timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);
  }
  await page.waitForTimeout(100);
}

/**
 * Fill a date input (accepts dd/mm/yyyy format).
 * Triggers blur after fill to ensure DateInput's controlled state syncs.
 */
export async function fillDate(page: Page, isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  const display = `${d}/${m}/${y}`;
  const input = page.getByPlaceholder("dd/mm/yyyy");
  await input.fill(display);
  await input.blur();
  await page.waitForTimeout(100);
}

/**
 * Click a voucher type tab on the vouchers page.
 */
export async function selectVoucherType(page: Page, shortLabel: string) {
  await page.getByRole("tab", { name: shortLabel }).first().click();
  await page.waitForTimeout(500);
}

/**
 * Fill an item line (qty, rate) in ItemLineTable.
 * Assumes the first empty item line is available.
 */
export async function fillItemLine(page: Page, stockItem: string, qty: number, rate: number, itemPlaceholder = "Select...", index = 0) {
  await selectOption(page, itemPlaceholder, stockItem, index);
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

  // LedgerLineTable uses a MasterSelector per row (combobox input with placeholder)
  const selectTrigger = row.getByPlaceholder("Select ledger...").first();
  await selectTrigger.click();
  await page.waitForTimeout(500);
  await selectTrigger.fill(ledger);
  await page.waitForTimeout(600);

  const option = page
    .locator("[data-master-popup] div.cursor-pointer", { hasText: ledger })
    .filter({ visible: true })
    .first();
  await option.click({ timeout: 5000 });
  await page.waitForTimeout(400);

  const inputs = row.locator("input[type='number']");
  if (debit > 0) {
    await inputs.nth(0).fill(String(debit));
  }
  if (credit > 0) {
    await inputs.nth(1).fill(String(credit));
  }
}

/**
 * Save the current voucher form. Label varies per form (Save, Save Sale, …).
 */
export async function saveVoucher(page: Page, label = "Save") {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(1000);
}
