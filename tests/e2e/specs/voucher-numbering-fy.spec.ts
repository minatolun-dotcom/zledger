/**
 * Per-FY Voucher Numbering E2E Tests (audit round 7 + 8)
 *
 * TallyPrime restarts the voucher-number sequence every financial year.
 * Round 7 added the FY-reset; round 8 made numbering follow the VOUCHER's
 * date (a June-2027 invoice gets INV-2027-… even while the system clock is
 * still inside FY 2026).
 *
 * 1. FY-prefix numbering configured for sales (INV-{YEAR}-{SEQ})
 * 2. Invoices dated in FY 2026 → INV-2026-0001, 0002…
 * 3. First invoice dated in FY 2027 → INV-2027-0001 (restart, not 0003)
 * 4. Next-number preview reflects the selected FY
 * 5. Browser: the Sales form's Voucher No. field pre-fills the next number
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";
import { loginAsAdmin } from "../helpers/login";

const API = "http://localhost:9090/api";
const WEB = "http://localhost:9090";

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

test.describe("Per-FY Voucher Numbering", () => {
  let token: string;
  let cid: string;
  let ledgerIds: Map<string, string>;
  let customer: any;
  let fy2627: any;
  let fy2728: any;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    const customers = await api(request, "GET", "/coa/parties?party_type=customer", token, cid);
    customer = customers.body[0];
    expect(customer).toBeTruthy();

    ledgerIds = await getLedgerIds(request, token, cid, ["Sales", "Cash"]);
    expect(ledgerIds.get("Sales")).toBeTruthy();
    expect(ledgerIds.get("Cash")).toBeTruthy();

    // The seed provides FY 2026-27; create 2027-28 so June-2027 dates validate.
    const fys = await api(request, "GET", "/coa/financial-years", token, cid);
    fy2627 = fys.body.find((f: any) => f.name === "2026-27");
    expect(fy2627).toBeTruthy();
    if (!fys.body.find((f: any) => f.name === "2027-28")) {
      const created = await api(request, "POST", "/coa/financial-years", token, cid, {
        name: "2027-28", start_date: "2027-04-01", end_date: "2028-03-31",
      });
      expect(created.status).toBe(201);
    }
    const fys2 = await api(request, "GET", "/coa/financial-years", token, cid);
    fy2728 = fys2.body.find((f: any) => f.name === "2027-28");
    expect(fy2728).toBeTruthy();
  });

  test("Sequence restarts at 0001 when the voucher's FY rolls over", async ({ request }) => {
    // The demo company has no numbering rows (legacy fallback). The GET
    // endpoint seeds default rows for every voucher type; then PATCH configures
    // the sales row with an FY-prefixed template.
    const seeded = await api(request, "GET", `/companies/${cid}/voucher-numbering`, token, cid);
    expect(seeded.status).toBe(200);
    const cfg = await api(request, "PATCH", `/companies/${cid}/voucher-numbering/sales`, token, cid, {
      prefix: "INV",
      format_template: "{PREFIX}-{YEAR}-{SEQ}",
      fy_start_month: 4,
    });
    expect(cfg.status).toBe(200);

    const stamp = Date.now();
    const makeSale = async (dateStr: string) => {
      const r = await api(request, "POST", "/vouchers", token, cid, {
        company_id: cid,
        voucher_type: "sales",
        voucher_date: dateStr,
        narration: `[E2E] numbering ${stamp}`,
        party_id: customer.id,
        lines: [
          { ledger_id: ledgerIds.get("Sales"), quantity: 1, rate: 100 },
          { ledger_id: ledgerIds.get("Cash"), debit: 100, credit: 0 },
        ],
      });
      expect(r.status).toBe(201);
      return r.body;
    };

    // Two invoices dated June 2026 (FY 2026-27 → year "2026").
    const a = await makeSale("2026-06-01");
    const b = await makeSale("2026-06-05");
    expect(a.voucher_number).toBe("INV-2026-0001");
    expect(b.voucher_number).toBe("INV-2026-0002");

    // First invoice dated June 2027 (FY 2027-28) must RESTART at 0001 —
    // even though the system clock is still inside FY 2026.
    const c = await makeSale("2027-06-01");
    expect(c.voucher_number).toBe("INV-2027-0001");

    const d = await makeSale("2027-06-10");
    expect(d.voucher_number).toBe("INV-2027-0002");

    // Next-number preview follows the selected FY.
    const prev2027 = await api(request, "GET", `/vouchers/next-number?voucher_type=sales&financial_year_id=${fy2728.id}`, token, cid);
    expect(prev2027.body.next_number).toBe("INV-2027-0003");

    const prev2026 = await api(request, "GET", `/vouchers/next-number?voucher_type=sales&financial_year_id=${fy2627.id}`, token, cid);
    expect(prev2026.body.next_number).toBe("INV-2026-0003");
  });

  test("Browser: Sales form Voucher No. pre-fills the FY's next number", async ({ page }) => {
    await loginAsAdmin(page);
    // The form only fetches the next number when an FY is selected — pin the
    // seed FY 2026-27 (the FY test 1's invoices were dated in) so the
    // suggestion is deterministic: INV-2026-0003.
    await page.evaluate((fyId) => localStorage.setItem("zledger.fyId", fyId), fy2627.id);
    await page.goto(`${WEB}/vouchers`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);

    // Sales tab should be active by default; the create form is inline.
    const salesTab = page.locator("button", { hasText: "Sales" }).first();
    if (await salesTab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await salesTab.click();
      await page.waitForTimeout(1500);
    }

    // The Voucher No. field's placeholder is the FY's next number — with the
    // default active FY (seed 2026-27) and 2 invoices already in FY 2026, the
    // suggestion must be INV-2026-0003.
    const field = page.locator('input[data-field="voucher_number"]').first();
    await expect(field).toBeVisible({ timeout: 8000 });
    const placeholder = (await field.getAttribute("placeholder")) || "";
    expect(placeholder).toMatch(/^INV-2026-0003$/);
  });
});
