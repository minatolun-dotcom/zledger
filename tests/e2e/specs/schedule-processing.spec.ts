import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { loginAsAdmin } from "../helpers/login";
import { ADMIN, PARTIES, LEDGERS, E2E_PREFIX } from "../helpers/fixtures";

const API = "http://localhost:9090/api";
const RUN_ID = Date.now();

// ── Local-date helpers (backend uses date.today() — local, not UTC) ─────
function localIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = localIso(new Date());
const yesterday = localIso(new Date(Date.now() - 86400000));
const future = localIso(new Date(Date.now() + 60 * 86400000));

async function loginAs(request: any, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: any) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: any, method: string, path: string, token?: string | null, companyId?: string | null, body?: any) {
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
    case "DELETE": res = await request.delete(`${API}${path}`, opts); break;
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status(), body: json };
}

async function getCompanyId(request: any, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id;
}

async function getLedgerIds(request: any, token: string, cid: string, names: string[]) {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

async function getPartyIds(request: any, token: string, cid: string, names: string[]) {
  const r = await api(request, "GET", "/coa/parties", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const party of r.body) {
      if (names.includes(party.name)) map.set(party.name, party.id);
    }
  }
  return map;
}

/** Payment voucher payload used by the frontend (party debit + bank credit). */
function paymentPayload(partyId: string, creditorId: string, bankId: string, narration: string) {
  return {
    voucher_type: "payment",
    voucher_date: yesterday,
    narration,
    reference: `${E2E_PREFIX} SCH-${RUN_ID}`,
    party_id: partyId,
    lines: [
      { ledger_id: creditorId, debit: 5000, credit: 0 },
      { ledger_id: bankId, debit: 0, credit: 5000 },
    ],
  };
}

test.describe("Schedule processing — recurring templates", () => {
  test.describe.configure({ mode: "serial" });

  let token: string;
  let cid: string;
  let creditorId: string;
  let bankId: string;
  let partyId: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
    const ledgers = await getLedgerIds(request, token, cid, [LEDGERS.sundryCreditors, LEDGERS.hdfcBank]);
    const parties = await getPartyIds(request, token, cid, [PARTIES.globalDistributors]);
    creditorId = ledgers.get(LEDGERS.sundryCreditors) || "";
    bankId = ledgers.get(LEDGERS.hdfcBank) || "";
    partyId = parties.get(PARTIES.globalDistributors) || "";
  });

  test("1. POST /process-due creates a voucher only for due + active templates", async ({ request }) => {
    expect(creditorId).toBeTruthy();
    expect(bankId).toBeTruthy();
    expect(partyId).toBeTruthy();

    const dueNarr = `${E2E_PREFIX} Schedule Due ${RUN_ID}`;
    const futureNarr = `${E2E_PREFIX} Schedule Future ${RUN_ID}`;
    const pausedNarr = `${E2E_PREFIX} Schedule Paused ${RUN_ID}`;

    // A: due + active → must be processed
    const a = await api(request, "POST", "/recurring-templates", token, cid, {
      name: `${E2E_PREFIX} Schedule Due ${RUN_ID}`,
      voucher_type: "payment",
      frequency: "monthly",
      next_run_date: yesterday,
      template_payload: paymentPayload(partyId, creditorId, bankId, dueNarr),
    });
    expect(a.status).toBe(201);

    // B: future date → must NOT be processed
    const b = await api(request, "POST", "/recurring-templates", token, cid, {
      name: `${E2E_PREFIX} Schedule Future ${RUN_ID}`,
      voucher_type: "payment",
      frequency: "monthly",
      next_run_date: future,
      template_payload: paymentPayload(partyId, creditorId, bankId, futureNarr),
    });
    expect(b.status).toBe(201);

    // C: due but paused (inactive) → must NOT be processed
    const c = await api(request, "POST", "/recurring-templates", token, cid, {
      name: `${E2E_PREFIX} Schedule Paused ${RUN_ID}`,
      voucher_type: "payment",
      frequency: "monthly",
      next_run_date: yesterday,
      template_payload: paymentPayload(partyId, creditorId, bankId, pausedNarr),
    });
    expect(c.status).toBe(201);
    const pause = await api(request, "PATCH", `/recurring-templates/${c.body.id}`, token, cid, { is_active: false });
    expect(pause.status).toBe(200);
    expect(pause.body.is_active).toBe(false);

    // Process due templates
    const run = await api(request, "POST", "/recurring-templates/process-due", token, cid);
    expect(run.status).toBe(200);
    expect(run.body.processed).toBeGreaterThanOrEqual(1);

    // The due template advanced: last_run = today, next_run = +1 month
    const list = await api(request, "GET", "/recurring-templates", token, cid);
    const tmplA = list.body.find((t: any) => t.name === `${E2E_PREFIX} Schedule Due ${RUN_ID}`);
    expect(tmplA).toBeTruthy();
    expect(tmplA.last_run_date).toBe(today);
    // next_run advances one month from the template's own next_run_date (yesterday)
    const nextFromRun = new Date(Date.now() - 86400000);
    nextFromRun.setMonth(nextFromRun.getMonth() + 1);
    expect(tmplA.next_run_date).toBe(localIso(nextFromRun));

    // Future + paused templates untouched
    const tmplB = list.body.find((t: any) => t.name === `${E2E_PREFIX} Schedule Future ${RUN_ID}`);
    const tmplC = list.body.find((t: any) => t.name === `${E2E_PREFIX} Schedule Paused ${RUN_ID}`);
    expect(tmplB.last_run_date).toBeNull();
    expect(tmplB.next_run_date).toBe(future);
    expect(tmplC.last_run_date).toBeNull();
    expect(tmplC.is_active).toBe(false);

    // The generated voucher appears in the daybook dated today
    const daybook = await api(request, "GET", `/reports/daybook?search=${encodeURIComponent(dueNarr)}&page=1&page_size=50`, token, cid);
    const entries: any[] = daybook.body.entries || [];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const generated = entries.find((e: any) => e.voucher_date === today);
    expect(generated, "generated voucher should be dated today").toBeTruthy();

    // Future / paused narrations produced NO vouchers
    const noFuture = await api(request, "GET", `/reports/daybook?search=${encodeURIComponent(futureNarr)}&page=1&page_size=50`, token, cid);
    expect((noFuture.body.entries || []).length).toBe(0);
    const noPaused = await api(request, "GET", `/reports/daybook?search=${encodeURIComponent(pausedNarr)}&page=1&page_size=50`, token, cid);
    expect((noPaused.body.entries || []).length).toBe(0);

    // The generated voucher's journal lines balance
    const vres = await api(request, "GET", `/vouchers/${generated.id}`, token, cid);
    const v = vres.body;
    expect(v.narration).toBe(dueNarr);
    const lines = v.lines || [];
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit || 0), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit || 0), 0);
    expect(Math.abs(dr - cr)).toBeLessThan(0.01);
    expect(dr).toBeGreaterThan(0);
  });

  test("2. cron_runner.process_due_for_all_companies (real scheduler) processes due templates", async ({ request }) => {
    // Create a fresh due template, then invoke the ACTUAL cron runner
    // function inside the api container (same code the scheduler service runs).
    const cronNarr = `${E2E_PREFIX} Schedule Cron ${RUN_ID}`;
    const created = await api(request, "POST", "/recurring-templates", token, cid, {
      name: `${E2E_PREFIX} Schedule Cron ${RUN_ID}`,
      voucher_type: "payment",
      frequency: "monthly",
      next_run_date: yesterday,
      template_payload: paymentPayload(partyId, creditorId, bankId, cronNarr),
    });
    expect(created.status).toBe(201);

    const script = [
      "from app.core.db import get_db",
      "from app.cron_runner import process_due_for_all_companies",
      "db = next(get_db())",
      "n = process_due_for_all_companies(db)",
      "print('PROCESSED', n)",
    ].join("; ");
    let out = "";
    try {
      out = execSync(
        `docker exec -w /app -e PYTHONPATH=/app zledger-api-1 python3 -c "${script}"`,
        { encoding: "utf-8", timeout: 60000 }
      );
    } catch (e: any) {
      throw new Error(`cron_runner docker exec failed: ${e.stderr || e.message}`);
    }
    const m = /PROCESSED (\d+)/.exec(out);
    expect(m, `cron runner output should report processed count, got: ${out}`).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1);

    // The cron-generated voucher is in the daybook dated today
    const daybook = await api(request, "GET", `/reports/daybook?search=${encodeURIComponent(cronNarr)}&page=1&page_size=50`, token, cid);
    const entries: any[] = daybook.body.entries || [];
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e: any) => e.voucher_date === today)).toBe(true);

    // Template advanced
    const list = await api(request, "GET", "/recurring-templates", token, cid);
    const tmpl = list.body.find((t: any) => t.name === `${E2E_PREFIX} Schedule Cron ${RUN_ID}`);
    expect(tmpl.last_run_date).toBe(today);
  });

  test("3. Recurring Templates page renders the processed schedule (UI smoke, no JS errors)", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));

    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);

    const row = page.locator("tbody tr", { hasText: `${E2E_PREFIX} Schedule Due ${RUN_ID}` });
    await expect(row.first()).toBeVisible({ timeout: 8000 });
    await expect(row.first()).toContainText("Active");

    expect(errors.length).toBe(0);
  });
});
