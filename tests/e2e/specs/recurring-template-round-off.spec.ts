import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption, fillDate, selectVoucherType } from "../helpers/interaction";
import { PARTIES, STOCK_ITEMS, E2E_PREFIX } from "../helpers/fixtures";

const RUN_ID = Date.now();
const API = "http://localhost:9090/api";

// ── Helpers ────────────────────────────────────────────────────────────────

async function openVouchersPage(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).first().click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(800);
}

/** Switch the footer "Round off to" Select to the given mode label. */
async function setRoundOffMode(page: Page, label: string) {
  const wrapper = page.locator("span", { hasText: "Round off to" }).last().locator("xpath=..");
  await wrapper.getByRole("button").first().click();
  await page.waitForTimeout(300);
  await page
    .locator("div.cursor-pointer", { hasText: new RegExp(`^${label}$`) })
    .filter({ visible: true })
    .first()
    .click({ timeout: 5000 });
  await page.waitForTimeout(500);
}

/** Fill a fractional sales line: party Royal Emporium + A4 Paper Ream 3 × 100.50. */
async function fillFractionalSalesLine(page: Page, narration: string) {
  await selectVoucherType(page, "Sales");
  await fillDate(page, "2026-07-15");
  await page.getByPlaceholder("Narration...").fill(narration);
  await selectOption(page, "Select party / cash / bank...", PARTIES.royalEmporium);
  await selectOption(page, "Search items...", STOCK_ITEMS.a4Paper);
  await page.waitForTimeout(400);
  const row = page.locator("table").first().locator("tbody tr").last();
  const inputs = row.locator("input[type='number']");
  await inputs.nth(0).fill("3");
  await inputs.nth(1).fill("100.50");
  await page.waitForTimeout(600);
}

/** Extract the Bearer token + active company from the logged-in page. */
async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("zledger.token"));
  const cid = await page.evaluate(() => localStorage.getItem("zledger.company"));
  return { Authorization: `Bearer ${token}`, "X-Company-Id": cid || "" };
}

/** Click a row action ("Run now" / "Edit" / "Delete") from the kebab menu. */
async function rowAction(page: Page, row: ReturnType<Page["locator"]>, label: string) {
  await row.locator("button[title='Actions']").click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

/** The template-name row on the recurring templates page. */
function templateRow(page: Page, name: string) {
  return page.locator("tbody tr", { hasText: name }).first();
}

/** The generated voucher's narration (template run re-dates it to today). */
const genNarration = `${E2E_PREFIX} RO rtpl ${RUN_ID}`;

test.describe("Recurring Template — Round Off round-trip", () => {
  test.describe.configure({ mode: "serial" });

  const templateName = `${E2E_PREFIX} RO rtpl ${RUN_ID}`;
  const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  test("1. Save a fractional Auto-mode sales voucher as a template", async ({ page }) => {
    await loginAsAdmin(page);
    await openVouchersPage(page);
    await fillFractionalSalesLine(page, genNarration);
    await setRoundOffMode(page, "Auto");

    await page.getByRole("button", { name: "Save as Template" }).click();
    const modal = page.getByRole("dialog", { name: "Save as Template" });
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByPlaceholder("e.g. Monthly rent, Salary payment").fill(templateName);
    await modal.getByRole("button", { name: "Save Template" }).click();
    await expect(page.getByText("Template saved!").first()).toBeVisible({ timeout: 8000 });

    // Save the voucher too so the form flow is realistic.
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });
  });

  test("2. Template row shows the Round Auto chip", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible({ timeout: 10000 });

    const row = templateRow(page, templateName);
    await expect(row).toBeVisible({ timeout: 8000 });
    await expect(row.getByText("Round Auto")).toBeVisible();
  });

  test("3. Edit modal Round Off selector is pre-set to Auto", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = templateRow(page, templateName);
    await expect(row).toBeVisible({ timeout: 8000 });

    await rowAction(page, row, "Edit");
    const modal = page.locator('[role="dialog"]');
    await expect(modal.getByRole("heading", { name: "Edit Template" })).toBeVisible({ timeout: 5000 });

    // The portal-based Select trigger shows the current value ("Auto").
    const label = modal.locator("label", { hasText: "Round Off" });
    const trigger = label.locator("xpath=..").getByRole("button").first();
    await expect(trigger).toContainText("Auto");

    // Close the modal (Cancel) to continue the serial flow.
    await modal.getByRole("button", { name: "Cancel" }).click();
    await expect(modal).toHaveCount(0);
  });

  test("4. Run now generates a ROUNDED voucher (₹338, +0.32 on Round Off)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = templateRow(page, templateName);
    await expect(row).toBeVisible({ timeout: 8000 });

    await rowAction(page, row, "Run now");
    await expect(page.getByText("Template executed successfully").first()).toBeVisible({ timeout: 8000 });

    const headers = await authHeaders(page);
    const res = await page.request.get(
      `${API}/reports/daybook?search=${encodeURIComponent(genNarration)}&page=1&page_size=50`,
      { headers },
    );
    expect(res.status()).toBe(200);
    const body: any = await res.json();
    const today = localIso(new Date());
    const generated = (body.entries || []).find((e: any) => e.voucher_date === today);
    expect(generated, "generated voucher should be dated today").toBeTruthy();
    expect(Math.abs(Number(generated.round_off) - 0.32)).toBeLessThan(0.021);

    const vres = await page.request.get(`${API}/vouchers/${generated.id}`, { headers });
    expect(vres.status()).toBe(200);
    const v: any = await vres.json();
    expect(Math.abs(Number(v.grand_total) - 338)).toBeLessThan(0.011);
    const lines = v.lines || [];
    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.011);
    expect(dr).toBeGreaterThan(0);
    expect(cr).toBeGreaterThan(0);
  });

  test("5. Voucher list shows the +₹0.32 Round Off cell for the generated voucher", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers?tab=browse");
    await page.getByPlaceholder("Search by voucher #, party, or narration...").fill(genNarration);
    await page.waitForTimeout(1200);

    const row = page.locator("tbody tr", { hasText: genNarration }).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await expect(row.getByText("+₹0.32")).toBeVisible();
  });

  test("6. Delete the template (cleanup)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = templateRow(page, templateName);
    await expect(row).toBeVisible({ timeout: 8000 });

    await rowAction(page, row, "Delete");
    const confirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(confirm.getByText("Delete this template?")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(templateRow(page, templateName)).toHaveCount(0, { timeout: 8000 });
  });
});
