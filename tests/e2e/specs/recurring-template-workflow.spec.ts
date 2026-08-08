import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectOption, fillDate, selectVoucherType, saveVoucher } from "../helpers/interaction";
import { PARTIES, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";

const RUN_ID = Date.now();
const API = "http://localhost:9090/api";

// ── Helpers ────────────────────────────────────────────────────────────────

async function openVouchersPage(page: Page) {
  await page.getByRole("link", { name: "Vouchers" }).click();
  await page.waitForURL("**/vouchers");
  await page.waitForTimeout(800);
}

async function expectSaved(page: Page) {
  await expect(page.getByText("Voucher Saved").first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

/** Fill the payment form (do NOT save — the test decides what to click). */
async function fillPaymentForm(page: Page, narration: string) {
  await selectVoucherType(page, "Payment");
  await fillDate(page, "2026-07-05");
  await selectOption(page, "Select cash / bank account...", LEDGERS.hdfcBank);
  await page.getByPlaceholder("Cheque / UTR / Ref #").fill(`${E2E_PREFIX} RT-${RUN_ID}`);
  await selectOption(page, "Select ledger...", PARTIES.globalDistributors);
  await page.getByRole("row").nth(1).getByPlaceholder("0.00").fill("5000");
  await page.getByPlaceholder("Narration...").fill(narration);
}

/** Extract the Bearer token + active company from the logged-in page. */
async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("zledger.token"));
  const cid = await page.evaluate(() => localStorage.getItem("zledger.company"));
  return { Authorization: `Bearer ${token}`, "X-Company-Id": cid || "" };
}

/** Click a row action ("Run now" / "Edit" / "Delete") from the kebab menu. */
async function rowAction(page: Page, row: ReturnType<Page["locator"]>, label: string) {
  // SortableTable kebab trigger exposes title="Actions" (no aria-label)
  await row.locator("button[title='Actions']").click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(500);
}

test.describe("Recurring Template — full workflow", () => {
  test.describe.configure({ mode: "serial" });

  const narration = `${E2E_PREFIX} RT Narration ${RUN_ID}`;
  const templateName = `${E2E_PREFIX} Monthly Payment ${RUN_ID}`;

  // Local (not UTC) ISO date — the backend uses date.today() (local time)
  const localIso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  test("1. Create a payment voucher and save it as a recurring template", async ({ page }) => {
    await loginAsAdmin(page);
    await openVouchersPage(page);
    await fillPaymentForm(page, narration);

    // Real user clicks "Save as Template" in the footer before saving
    await page.getByRole("button", { name: "Save as Template" }).click();
    const modal = page.getByRole("dialog", { name: "Save as Template" });
    await expect(modal).toBeVisible({ timeout: 5000 });
    await modal.getByPlaceholder("e.g. Monthly rent, Salary payment").fill(templateName);
    await modal.getByRole("button", { name: "Monthly", exact: true }).click();
    await modal.getByRole("button", { name: "Save Template" }).click();
    await expect(page.getByText("Template saved!").first()).toBeVisible({ timeout: 8000 });

    // Now save the voucher itself
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expectSaved(page);
  });

  test("2. Template listed with correct metadata and Run Now works", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible({ timeout: 10000 });

    // Find the template row
    const row = page.locator("tbody tr", { hasText: templateName });
    await expect(row.first()).toBeVisible({ timeout: 8000 });
    await expect(row.first()).toContainText("payment");
    await expect(row.first()).toContainText("monthly");
    await expect(row.first()).toContainText("Active");

    // Run Now → toast fires
    await rowAction(page, row.first(), "Run now");
    await expect(page.getByText("Template executed successfully").first()).toBeVisible({ timeout: 8000 });

    // Verify via API: last_run_date is today and next_run advanced one month
    // (the relative "Just now" label is timezone-sensitive; the API is not)
    const headers = await authHeaders(page);
    const list = await page.request.get(`${API}/recurring-templates`, { headers });
    expect(list.status()).toBe(200);
    const templates: any[] = await list.json();
    const tmpl = templates.find((t) => t.name === templateName);
    expect(tmpl, "template should exist after run").toBeTruthy();
    const today = localIso(new Date());
    expect(tmpl!.last_run_date?.slice(0, 10)).toBe(today);
    const expectedNext = new Date();
    expectedNext.setMonth(expectedNext.getMonth() + 1);
    expect(tmpl!.next_run_date).toBe(localIso(expectedNext));
  });

  test("3. Run Now generated a voucher — journal entries balance via API", async ({ page }) => {
    await loginAsAdmin(page);
    const headers = await authHeaders(page);

    // Find the generated voucher: the template run dates it TODAY (the manual
    // voucher is dated 2026-07-05, so today's entry is the generated one).
    const res = await page.request.get(
      `${API}/reports/daybook?search=${encodeURIComponent(narration)}&page=1&page_size=50`,
      { headers },
    );
    expect(res.status()).toBe(200);
    const body: any = await res.json();
    const today = localIso(new Date());
    const generated = (body.entries || []).find((e: any) => e.voucher_date === today);
    expect(generated, "expected a generated voucher dated today").toBeTruthy();

    // Fetch the full voucher and verify its journal lines balance
    const vres = await page.request.get(`${API}/vouchers/${generated.id}`, { headers });
    expect(vres.status()).toBe(200);
    const v: any = await vres.json();
    expect(v.narration).toBe(narration);
    const lines = v.lines || [];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
    expect(dr).toBeGreaterThan(0);
    expect(cr).toBeGreaterThan(0);
  });

  test("4. Pause / Resume toggles the template status", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = page.locator("tbody tr", { hasText: templateName });
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    await row.first().getByRole("button", { name: "Active" }).click();
    await expect(row.first().getByRole("button", { name: "Paused" })).toBeVisible({ timeout: 5000 });

    await row.first().getByRole("button", { name: "Paused" }).click();
    await expect(row.first().getByRole("button", { name: "Active" })).toBeVisible({ timeout: 5000 });
  });

  test("5. Edit the template name persists", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = page.locator("tbody tr", { hasText: templateName });
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    await rowAction(page, row.first(), "Edit");
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toHaveCount(1, { timeout: 5000 });
    await expect(modal.getByRole("heading", { name: "Edit Template" })).toBeVisible();
    const updatedName = `${templateName} v2`;
    await modal.getByPlaceholder("e.g. Monthly Rent").fill(updatedName);
    await modal.getByRole("button", { name: "Update Template" }).click();

    await expect(page.locator("tbody tr", { hasText: updatedName }).first()).toBeVisible({ timeout: 8000 });
  });

  test("6. Delete the template (cleanup)", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    const row = page.locator("tbody tr", { hasText: `${templateName} v2` });
    await expect(row.first()).toBeVisible({ timeout: 8000 });

    await rowAction(page, row.first(), "Delete");
    const confirm = page.getByRole("dialog", { name: "Confirm" });
    await expect(confirm.getByText("Delete this template?")).toBeVisible();
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(row).toHaveCount(0, { timeout: 8000 });
  });
});
