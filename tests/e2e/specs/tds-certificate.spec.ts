/**
 * TDS Certificate E2E Tests (audit round 8 + 9)
 *
 * Verifies the statutory certificate pipeline end-to-end:
 * 1. Seed TDS sections (mirrors the setup flow)
 * 2. Payment voucher + TDS entry, deposited with a challan
 * 3. A bare-quarter certificate ("Q2" — the UI's exact payload) must land in
 *    the CURRENT financial year and include the deposited entry
 * 4. A different quarter must not include it (period boundaries respected)
 * 5. The certificate list shows the generated certificates
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";
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

test.describe("TDS Certificate Flow", () => {
  let token: string;
  let cid: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);

    const seeded = await api(request, "POST", "/tds-tcs/sections/seed", token, cid);
    expect(seeded.status).toBe(201);
  });

  test("Deposited entry lands in the current-FY quarter certificate", async ({ request }) => {
    // Dedicated supplier + payment voucher + deposited TDS entry.
    const stamp = Date.now();
    const sup = await api(request, "POST", "/coa/parties", token, cid, {
      name: `E2E Cert Supplier ${stamp}`,
      party_type: "supplier",
    });
    expect(sup.status).toBe(201);

    const ledgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const supLed = ledgers.body.find((l: any) => l.id === sup.body.ledger_id);
    const bank = ledgers.body.find((l: any) => l.name === "Cash");
    expect(supLed).toBeTruthy();
    expect(bank).toBeTruthy();

    const sections = await api(request, "GET", "/tds-tcs/sections", token, cid);
    const section = sections.body.find((s: any) => String(s.tds_tcs_type || "").toLowerCase() === "tds");
    expect(section).toBeTruthy();

    // Payment dated in the current FY (Q2: Jul–Sep 2026).
    const v = await api(request, "POST", "/vouchers", token, cid, {
      company_id: cid,
      voucher_type: "payment",
      voucher_date: "2026-08-15",
      narration: `[E2E] tds cert ${stamp}`,
      party_id: sup.body.id,
      lines: [
        { ledger_id: supLed.id, debit: 50000, credit: 0 },
        { ledger_id: bank.id, debit: 0, credit: 50000 },
      ],
    });
    expect(v.status).toBe(201);

    const e = await api(request, "POST", "/tds-tcs/entries", token, cid, {
      voucher_id: v.body.id,
      section_id: section.id,
      base_amount: 50000,
      entry_date: "2026-08-15",
    });
    expect(e.status).toBe(201);

    const dep = await api(request, "POST", "/tds-tcs/deposit", token, cid, {
      entry_ids: [e.body.id],
      challan_number: `CH-${stamp}`,
      deposition_date: "2026-09-10",
    });
    expect(dep.status).toBe(200);

    // Bare quarter — the UI's exact payload. With the round-8 fix the period
    // resolves to the CURRENT FY (2026), so Q2 = Jul–Sep 2026 and the
    // Aug-15 entry is INCLUDED. (Pre-fix it fell back to FY 2024 → count 0.)
    const q2 = await api(request, "POST", "/tds-tcs/certificates/generate?period_type=quarter&period_value=Q2&form_type=form_16a", token, cid);
    expect(q2.status).toBe(200);
    expect(q2.body.count).toBe(1);
    const cert = q2.body.certificates[0];
    expect(cert.total_base_amount).toBe(50000);
    expect(cert.total_deducted_amount).toBeGreaterThan(0);

    // A different quarter of the same FY must not include the Aug-15 entry.
    const q3 = await api(request, "POST", "/tds-tcs/certificates/generate?period_type=quarter&period_value=Q3&form_type=form_16a", token, cid);
    expect(q3.status).toBe(200);
    expect(q3.body.count).toBe(0);

    // The certificate list surfaces the generated row.
    const list = await api(request, "GET", "/tds-tcs/certificates?form_type=form_16a", token, cid);
    expect(list.status).toBe(200);
    const rows = Array.isArray(list.body) ? list.body : (list.body.certificates || []);
    expect(rows.some((c: any) => c.certificate_number === cert.certificate_number)).toBe(true);
  });
});
