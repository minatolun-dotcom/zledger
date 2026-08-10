import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

/**
 * Exercises SortableTable's `keyboardNav` prop (the shared useListKeyboardNav
 * path) through a real consumer: the Recurring Templates table. Covers the
 * latent branches that Day Book / Voucher List don't — Delete → danger-action
 * confirm, and scroll/highlight on a table that renders actions.
 */

const RUN_ID = Date.now();
const API = "http://localhost:9090/api";
const NAME_A = `${E2E_PREFIX} KBD-A ${RUN_ID}`;
const NAME_B = `${E2E_PREFIX} KBD-B ${RUN_ID}`;
let token = "";
let cid = "";

const table = '[data-table-key="recurring-templates"]';
const highlighted = `${table} tbody tr[class*="ring-brand-300"]`;

async function readCredentials(page: Page) {
  token = (await page.evaluate(() => localStorage.getItem("zledger.token"))) || "";
  cid = (await page.evaluate(() => localStorage.getItem("zledger.company"))) || "";
}

async function createTemplate(request: APIRequestContext, name: string) {
  const r = await request.post(`${API}/recurring-templates`, {
    headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    data: {
      name,
      voucher_type: "journal",
      frequency: "monthly",
      next_run_date: "2026-07-15",
      template_payload: {
        voucher_type: "journal",
        voucher_date: "2026-07-15",
        narration: `kbd ${name}`,
        lines: [
          { ledger_id: "x", debit: 100, credit: 0 },
          { ledger_id: "y", debit: 0, credit: 100 },
        ],
      },
    },
  });
  expect(r.status()).toBe(201);
}

async function openTemplates(page: Page) {
  await page.goto("/recurring-templates");
  await page.waitForSelector(table, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible();
}

/** Blur any focused control so the document-level keyboard handler takes over. */
async function blurToBody(page: Page) {
  await page.getByRole("heading", { name: "Recurring Templates" }).click();
  await page.waitForTimeout(200);
}

test.describe("SortableTable keyboardNav — Recurring Templates", () => {
  test.describe.configure({ mode: "serial" });

  test("1. Setup: create two recurring templates via API", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    await createTemplate(request, NAME_A);
    await createTemplate(request, NAME_B);
  });

  test("2. ArrowDown highlights a row; ArrowDown moves to the next row", async ({ page }) => {
    await loginAsAdmin(page);
    await openTemplates(page);
    await blurToBody(page);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    const hl1 = page.locator(highlighted);
    await expect(hl1).toHaveCount(1, { timeout: 4000 });
    const firstText = (await hl1.locator("td").first().innerText()).trim();
    expect(firstText.length).toBeGreaterThan(0);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await expect(hl1).toHaveCount(1, { timeout: 4000 });
    const secondText = (await hl1.locator("td").first().innerText()).trim();
    expect(secondText).not.toBe(firstText); // highlight actually moved
  });

  test("3. Escape clears the highlight", async ({ page }) => {
    await loginAsAdmin(page);
    await openTemplates(page);
    await blurToBody(page);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await expect(page.locator(highlighted)).toHaveCount(1, { timeout: 4000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    await expect(page.locator(highlighted)).toHaveCount(0, { timeout: 4000 });
  });

  test("4. Delete on a highlighted row opens the danger confirm; Escape cancels, nothing deleted", async ({ page }) => {
    await loginAsAdmin(page);
    await openTemplates(page);
    await blurToBody(page);

    const rowCountBefore = await page.locator(`${table} tbody tr`).count();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(250);
    await expect(page.locator(highlighted)).toHaveCount(1, { timeout: 4000 });

    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    await expect(page.getByText("Delete this template?").first()).toBeVisible({ timeout: 6000 });

    // Cancel via Escape — row must remain and nothing may be deleted
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(page.getByText("Delete this template?").first()).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator(`${table} tbody tr`)).toHaveCount(rowCountBefore, { timeout: 4000 });
  });

  test("5. Typing in the search box does not hijack row navigation", async ({ page }) => {
    await loginAsAdmin(page);
    await openTemplates(page);
    await page.getByPlaceholder("Search templates...").click();
    await page.keyboard.type("zzz-no-match");
    await page.waitForTimeout(300);
    await expect(page.locator(highlighted)).toHaveCount(0, { timeout: 4000 });
  });

  test("6. Cleanup: delete the created templates", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    const list = await request.get(`${API}/recurring-templates`, {
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    });
    expect(list.status()).toBe(200);
    const items = (await list.json()) as { id: string; name: string }[];
    for (const t of items) {
      if (t.name === NAME_A || t.name === NAME_B) {
        const del = await request.delete(`${API}/recurring-templates/${t.id}`, {
          headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
        });
        expect([200, 204].includes(del.status())).toBe(true);
      }
    }
  });
});

test.describe("SortableTable keyboardNav — Batch Browse", () => {
  test.describe.configure({ mode: "serial" });

  const batchNumber = `${E2E_PREFIX} KBD-BATCH ${RUN_ID}`;
  let batchId = "";
  const headers = () => ({ Authorization: `Bearer ${token}`, "X-Company-Id": cid });

  test("1. Setup: create a batch via API", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    const items = await request.get(`${API}/inventory/items`, { headers: headers() });
    expect(items.status()).toBe(200);
    const itemList = (await items.json()) as { id: string; name: string; tracking_mode?: string }[];
    // Batches can only be created for batch-tracked items (the New Batch
    // dropdown filters on tracking_mode). Pick one the same way the UI does.
    const batchItem =
      itemList.find((i) => i.tracking_mode === "batch") ??
      itemList.find((i) => i.name === "Wireless Mouse");
    expect(batchItem, "no batch-tracked item in Apex seed data").toBeTruthy();
    const r = await request.post(`${API}/manufacturing/batches`, {
      headers: headers(),
      data: {
        stock_item_id: batchItem!.id,
        batch_number: batchNumber,
        manufacturing_date: "2026-07-01",
        expiry_date: "2027-07-01",
        // quantity 0 (default) — delete_batch only allows zero-quantity,
        // no-ledger batches, so this keeps the cleanup test deletable.
      },
    });
    expect(r.status()).toBe(201);
    batchId = (await r.json()).id;
  });

  test("2. ArrowDown highlights; Delete opens the danger confirm; Escape cancels", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/batches");
    await page.waitForSelector('[data-table-key="batch-browse"]', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole("heading", { name: "Batches" }).click(); // blur to body
    await page.waitForTimeout(200);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    const hl = page.locator('[data-table-key="batch-browse"] tbody tr[class*="ring-brand-300"]');
    await expect(hl).toHaveCount(1, { timeout: 4000 });

    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    await expect(page.getByText(/Delete batch /).first()).toBeVisible({ timeout: 6000 });

    // Cancel — the batch must survive
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(page.getByText(/Delete batch /).first()).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator('[data-table-key="batch-browse"] tbody tr', { hasText: batchNumber })).toHaveCount(1);
  });

  test("3. Cleanup: delete the batch", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    const del = await request.delete(`${API}/manufacturing/batches/${batchId}`, { headers: headers() });
    expect([200, 204].includes(del.status())).toBe(true);
  });
});

test.describe("SortableTable keyboardNav — HSN/SAC", () => {
  test.describe.configure({ mode: "serial" });

  // HSN codes must be 4-8 digits — derive two unique ones from the run id.
  const tail = String(RUN_ID).slice(-6);
  const CODE_A = `9${tail}`;
  const CODE_B = `8${tail}`;
  const ids: string[] = [];
  const headers = () => ({ Authorization: `Bearer ${token}`, "X-Company-Id": cid });

  test("1. Setup: create two HSN/SAC codes via API", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    for (const code of [CODE_A, CODE_B]) {
      const r = await request.post(`${API}/gst/hsn-sac`, {
        headers: headers(),
        data: { code, description: `KBD keyboard test ${code}`, gst_rate: 18, code_type: "hsn" },
      });
      expect(r.status()).toBe(201);
      ids.push((await r.json()).id);
    }
  });

  test("2. ArrowDown highlights; Delete opens the danger confirm; Escape cancels", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst?tab=hsn-sac");
    await page.waitForSelector('[data-table-key="hsn-sac"]', { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole("heading", { name: "HSN / SAC Codes" }).click(); // blur to body
    await page.waitForTimeout(200);

    const rowCountBefore = await page.locator('[data-table-key="hsn-sac"] tbody tr').count();
    expect(rowCountBefore).toBeGreaterThan(0);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    await expect(page.locator('[data-table-key="hsn-sac"] tbody tr[class*="ring-brand-300"]')).toHaveCount(1, { timeout: 4000 });

    await page.keyboard.press("Delete");
    await page.waitForTimeout(500);
    await expect(page.getByText("Delete this HSN/SAC code?").first()).toBeVisible({ timeout: 6000 });

    // Cancel via Escape — nothing may be deleted
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(page.getByText("Delete this HSN/SAC code?").first()).toHaveCount(0, { timeout: 4000 });
    await expect(page.locator('[data-table-key="hsn-sac"] tbody tr')).toHaveCount(rowCountBefore, { timeout: 4000 });
  });

  test("3. Cleanup: delete the created codes", async ({ page, request }) => {
    await loginAsAdmin(page);
    await readCredentials(page);
    for (const id of ids) {
      const del = await request.delete(`${API}/gst/hsn-sac/${id}`, { headers: headers() });
      expect([200, 204].includes(del.status())).toBe(true);
    }
  });
});

test.describe("SortableTable keyboardNav — Audit Log", () => {
  const table = '[data-table-key="audit-log"]';

  test("1. Audit log table has rows to navigate", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/audit");
    await page.waitForSelector(table, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await expect(page.locator(`${table} tbody tr`).first()).toBeVisible({ timeout: 6000 });
  });

  test("2. ArrowDown highlights; Enter opens the detail modal; Escape closes", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/audit");
    await page.waitForSelector(table, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.getByRole("heading", { name: "Audit Log" }).click(); // blur to body
    await page.waitForTimeout(200);

    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    await expect(page.locator(`${table} tbody tr[class*="ring-brand-300"]`)).toHaveCount(1, { timeout: 4000 });

    await page.keyboard.press("Enter");
    await page.waitForTimeout(800);
    await expect(page.locator('[role="dialog"]')).toHaveCount(1, { timeout: 6000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0, { timeout: 4000 });
  });
});
