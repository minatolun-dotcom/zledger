/**
 * Performance test: 10k vouchers.
 *
 * Seeds a dedicated "Test Co Perf" company with 10,000 journal vouchers via
 * a direct DB bulk-insert (fast path — API POST of 10k vouchers would take
 * hours), then measures list / daybook / search latency through the live API
 * and asserts sane bounds. Cleans up the company afterwards.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";
const COMPANY_NAME = "Test Co Perf";

async function login(request: APIRequestContext) {
  const res = await request.post(`${API}/auth/login`, { data: { email: ADMIN.email, password: ADMIN.password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token as string;
}

function runSeedScript(token: string, companyId: string, cashId: string, salesId: string, count: number) {
  // Bulk-insert `count` journal vouchers (Dr Cash / Cr Sales) in chunks.
  // The script is written to a temp file and copied into the container to
  // avoid shell-quoting issues with embedded newlines.
  const py = `
import time
from app.core.db import get_db
from app.models.voucher import Voucher, VoucherLine
db = next(get_db())
cid = ${JSON.stringify(companyId)}
cash = ${JSON.stringify(cashId)}
sales = ${JSON.stringify(salesId)}
N = ${count}
t0 = time.time()
BATCH = 500
for start in range(0, N, BATCH):
    end = min(start + BATCH, N)
    ids = [f"perf-{i:05d}" for i in range(start, end)]
    for i, vid in zip(range(start, end), ids):
        db.add(Voucher(id=vid, company_id=cid,
            voucher_type="journal", voucher_number=f"PERF-JRN-{i+1:06d}",
            voucher_date="2026-06-01", narration="perf load test",
            document_type="regular", status="posted",
            subtotal=1000, discount_total=0, tax_total=0, grand_total=1000))
    db.flush()
    for i, vid in zip(range(start, end), ids):
        db.add(VoucherLine(voucher_id=vid, ledger_id=cash, debit=1000, credit=0, line_total=1000))
        db.add(VoucherLine(voucher_id=vid, ledger_id=sales, debit=0, credit=1000, line_total=1000))
    db.commit()
    print(f"seeded {end}/{N}", flush=True)
print(f"seed done in {time.time()-t0:.1f}s")
`;
  const tmp = `/tmp/perf-seed-${Date.now()}.py`;
  writeFileSync(tmp, py);
  try {
    execSync(`docker cp ${tmp} zledger-api-1:/tmp/perf-seed.py && docker exec -w /app -e PYTHONPATH=/app zledger-api-1 python3 /tmp/perf-seed.py`, { stdio: "inherit" });
  } finally {
    unlinkSync(tmp);
  }
}

test("10k vouchers: list, daybook and search stay responsive", async ({ request }) => {
  // Seeding 10k vouchers via docker exec plus the force-delete cleanup
  // (30-60s per the cleanup comment) can exceed the 60s default timeout on
  // slow 2-core hosts — give the test a comfortable ceiling.
  test.setTimeout(180_000);
  const token = await login(request);
  const auth = { Authorization: `Bearer ${token}` };
  const headers = { ...auth, "X-Company-Id": "" };

  // 1. Create the perf company as superadmin.
  const createRes = await request.post(`${API}/admin/companies`, {
    headers: auth,
    data: { name: COMPANY_NAME },
  });
  expect(createRes.status()).toBe(201);
  const company = await createRes.json();
  const cid = company.id;

  try {
    // 2. Create account groups + cash/sales ledgers via API.
    const mkGroup = async (name: string) => {
      const r = await request.post(`${API}/coa/groups`, {
        headers: { ...auth, "X-Company-Id": cid },
        data: { name },
      });
      expect(r.ok()).toBeTruthy();
      return (await r.json()).id;
    };
    const cashGroupId = await mkGroup("Cash in Hand");
    const salesGroupId = await mkGroup("Direct Income");
    const mkLedger = async (name: string, groupId: string) => {
      const r = await request.post(`${API}/coa/ledgers`, {
        headers: { ...auth, "X-Company-Id": cid },
        data: { name, group_id: groupId },
      });
      expect(r.ok()).toBeTruthy();
      return (await r.json()).id;
    };
    const cashId = await mkLedger("Cash", cashGroupId);
    const salesId = await mkLedger("Sales", salesGroupId);

    // 3. Bulk-insert 10k vouchers directly in the DB.
    runSeedScript(token, cid, cashId, salesId, 10_000);

    const cidHeaders = { ...auth, "X-Company-Id": cid };

    // 4. Measure API latency on the seeded data.
    const timings: Record<string, number> = {};

    let t = Date.now();
    const listRes = await request.get(`${API}/vouchers?limit=50&offset=0`, { headers: cidHeaders });
    timings.listFirstPage = Date.now() - t;
    expect(listRes.ok()).toBeTruthy();
    const listBody = await listRes.json();
    expect(listBody.total).toBe(10_000);

    t = Date.now();
    const deepPage = await request.get(`${API}/vouchers?limit=50&offset=9900`, { headers: cidHeaders });
    timings.listDeepPage = Date.now() - t;
    expect(deepPage.ok()).toBeTruthy();

    t = Date.now();
    const filtered = await request.get(`${API}/vouchers?limit=50&voucher_type=journal`, { headers: cidHeaders });
    timings.listFiltered = Date.now() - t;
    expect(filtered.ok()).toBeTruthy();

    t = Date.now();
    const daybook = await request.get(`${API}/reports/daybook?page=1&page_size=50`, { headers: cidHeaders });
    timings.daybook = Date.now() - t;
    expect(daybook.ok()).toBeTruthy();

    t = Date.now();
    const search = await request.get(`${API}/vouchers?limit=50&search=PERF-JRN-050000`, { headers: cidHeaders });
    timings.search = Date.now() - t;
    if (!search.ok()) console.log("SEARCH FAIL:", search.status(), (await search.text()).slice(0, 200));
    expect(search.ok()).toBeTruthy();

    console.log("PERF TIMINGS (ms):", JSON.stringify(timings));

    // Bounds: with a proper index on (company_id, voucher_date), paged
    // queries must stay under 2s even at 10k rows; the deep page exercises
    // the offset path.
    expect(timings.listFirstPage).toBeLessThan(2000);
    expect(timings.listDeepPage).toBeLessThan(2000);
    expect(timings.listFiltered).toBeLessThan(2000);
    expect(timings.daybook).toBeLessThan(3000);
    expect(timings.search).toBeLessThan(2000);
  } finally {
    // 5. Cleanup: deactivate then force-delete the perf company.
    //    Deleting 10k vouchers + 20k lines takes 30-60s — use a long timeout.
    await request.patch(`${API}/admin/companies/${cid}`, {
      headers: auth,
      data: { is_active: false },
      timeout: 120_000,
    });
    const del = await request.delete(`${API}/admin/companies/${cid}?force=true`, { headers: auth, timeout: 120_000 });
    if (!del.ok() && del.status() !== 404) console.log("cleanup warning:", del.status(), await del.text());
  }
});
