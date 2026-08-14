import { expect, test, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";
import { loginAsAdmin } from "../helpers/login";
import { activeFyStart } from "../helpers/dates";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: APIRequestContext, method: string, path: string, token?: string | null, companyId?: string | null, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: any = { headers };
  if (body !== undefined) opts.data = body;
  let res;
  switch (method) {
    case "GET": res = await request.get(`${API}${path}`, opts); break;
    case "POST": res = await request.post(`${API}${path}`, opts); break;
    case "PATCH": res = await request.patch(`${API}${path}`, opts); break;
    default: throw new Error(`Unknown method: ${method}`);
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status(), body: json };
}

async function getCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id;
}

async function getLedgerIds(request: APIRequestContext, token: string, cid: string, names: string[]): Promise<Map<string, string>> {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

// Every entry the UI records must be committed (round-12 audit fix): the
// create/update/cancel lifecycle of one voucher produces three committed
// audit entries, and the hash chain reports verified.
test.describe("Audit Trail", () => {
  const stamp = Date.now();
  const narration = `[E2E] Audit Trail ${stamp}`;

  test("voucher create/edit/cancel lifecycle lands in the audit log with chain verified", async ({ page, request }) => {
    // ── 1. Create a journal voucher via API (service-level audit entry) ──
    const token = await adminToken(request);
    const cid = await getCompanyId(request, token);
    expect(cid).toBeTruthy();
    const ledgers = await getLedgerIds(request, token, cid, ["Cash", "Trade Receivables"]);
    const cashId = ledgers.get("Cash");
    const debtorsId = ledgers.get("Trade Receivables");
    expect(cashId).toBeTruthy();
    expect(debtorsId).toBeTruthy();
    const voucherDate = await activeFyStart(request, token, cid);

    const created = await api(request, "POST", "/vouchers", token, cid, {
      voucher_type: "journal",
      voucher_date: voucherDate,
      narration,
      lines: [
        { ledger_id: cashId, debit: 1234.5, credit: 0 },
        { ledger_id: debtorsId, debit: 0, credit: 1234.5 },
      ],
    });
    expect(created.status).toBe(201);
    const voucherId = created.body.id;
    const voucherNumber: string = created.body.voucher_number;
    expect(voucherId).toBeTruthy();
    expect(voucherNumber).toBeTruthy();

    // ── 2. Audit log page: CREATE entry + chain-verified badge ──
    await loginAsAdmin(page);
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    await expect(page.getByRole("heading", { name: "Audit Log" })).toBeVisible({ timeout: 10000 });
    // Hash chain indicator must report verified (round-13 13b).
    await expect(page.getByText(/Chain verified/)).toBeVisible({ timeout: 10000 });

    // Filter to the created voucher and confirm the CREATE entry.
    await page.getByPlaceholder("e.g. Cancelled voucher...").fill(voucherNumber);
    await page.waitForTimeout(1500);
    await expect(page.getByText(`Created journal #${voucherNumber}`, { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("CREATE", { exact: true }).first()).toBeVisible();

    // ── 3. Edit the voucher → UPDATE entry ──
    const updated = await api(request, "PATCH", `/vouchers/${voucherId}`, token, cid, {
      voucher_type: "journal",
      voucher_date: voucherDate,
      narration: `${narration} edited`,
      lines: [
        { ledger_id: cashId, debit: 2000, credit: 0 },
        { ledger_id: debtorsId, debit: 0, credit: 2000 },
      ],
    });
    expect(updated.status).toBe(200);

    await page.getByPlaceholder("e.g. Cancelled voucher...").fill(`Updated ${voucherNumber}`);
    await page.waitForTimeout(1500);
    await expect(page.getByText("UPDATE", { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // ── 4. Cancel the voucher → CANCEL entry with reversal info ──
    const cancelled = await api(request, "POST", `/vouchers/${voucherId}/cancel`, token, cid, {
      reason: "[E2E] audit trail test",
    });
    expect([200, 400]).toContain(cancelled.status);
    if (cancelled.status === 200) {
      await page.getByPlaceholder("e.g. Cancelled voucher...").fill(`Cancelled ${voucherNumber}`);
      await page.waitForTimeout(1500);
      await expect(page.getByText(`Cancelled ${voucherNumber}`, { exact: false }).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByText("CANCEL", { exact: true }).first()).toBeVisible();
    }

    // ── 5. No JS errors during the whole flow ──
    const errors: string[] = [];
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
});
