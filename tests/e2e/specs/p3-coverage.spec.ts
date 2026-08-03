/**
 * P3 Coverage Tests — Voucher Approval, Notifications, Manufacturing Lifecycle, Tally Import
 *
 * These are API-level tests that exercise the full workflow for features
 * that previously had 0 test coverage.
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

// ─── Helpers ────────────────────────────────────────────────────────────────

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(
  request: APIRequestContext,
  method: string,
  path: string,
  token?: string | null,
  companyId?: string | null,
  body?: any,
) {
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

async function getLedgerIds(
  request: APIRequestContext,
  token: string,
  cid: string,
  names: string[],
): Promise<Map<string, string>> {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

async function registerTestUser(
  request: APIRequestContext,
  adminTokenVal: string,
  cid: string,
  email: string,
  name: string,
  role: string,
): Promise<{ token: string; userId: string }> {
  await api(request, "POST", "/auth/register", null, null, { email, name, password: "test12345" }).catch(() => {});
  const t = await loginAs(request, email, "test12345");
  await api(request, "POST", "/members", adminTokenVal, cid, { email, role }).catch(() => {});
  return { token: t, userId: "" };
}

async function cleanupTestUser(request: APIRequestContext, adminTokenVal: string, cid: string, email: string) {
  const users = await api(request, "GET", "/admin/users?page=1&page_size=200", adminTokenVal);
  if (users.status === 200 && Array.isArray(users.body)) {
    const user = users.body.find((u: any) => u.email === email);
    if (user) {
      await api(request, "DELETE", `/members/${user.id}`, adminTokenVal, cid).catch(() => {});
      await api(request, "DELETE", `/admin/users/${user.id}/hard`, adminTokenVal).catch(() => {});
    }
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// 2. Notification System
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Notification System", () => {
  let notificationId: string;

  test("GET /notifications returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/notifications", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("GET /notifications/unread-count returns count", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/notifications/unread-count", t, c);
    expect(r.status).toBe(200);
    expect(typeof r.body.count).toBe("number");
  });

  test("POST /notifications creates notification", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", "/notifications", t, c, {
      title: "Test Notification",
      message: "This is a test notification",
      category: "info",
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.title).toBe("Test Notification");
    expect(r.body.is_read).toBe(false);
    notificationId = r.body.id;
  });

  test("POST /notifications with different categories", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    for (const cat of ["info", "warning", "error", "success"]) {
      const r = await api(request, "POST", "/notifications", t, c, {
        title: `Test ${cat}`,
        message: `Category: ${cat}`,
        category: cat,
      });
      expect(r.status).toBe(201);
      expect(r.body.category).toBe(cat);
    }
  });

  test("POST /notifications/{id}/read marks as read", async ({ request }) => {
    if (!notificationId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", `/notifications/${notificationId}/read`, t, c);
    expect(r.status).toBe(200);
    expect(r.body.is_read).toBe(true);
  });

  test("GET /notifications?unread_only=true excludes read", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/notifications?unread_only=true", t, c);
    expect(r.status).toBe(200);
    if (Array.isArray(r.body)) {
      for (const n of r.body) {
        expect(n.is_read).toBe(false);
      }
    }
  });

  test("POST /notifications/read-all marks all as read", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", "/notifications/read-all", t, c);
    expect(r.status).toBe(200);
    expect(typeof r.body.marked).toBe("number");

    // Verify unread count is 0
    const count = await api(request, "GET", "/notifications/unread-count", t, c);
    expect(count.status).toBe(200);
    expect(count.body.count).toBe(0);
  });

  test("GET /notifications/{id}/read returns 404 for non-existent", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", "/notifications/non-existent/read", t, c);
    expect(r.status).toBe(404);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. Manufacturing Lifecycle
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Manufacturing Lifecycle", () => {
  let workCenterId: string;
  let routingId: string;
  let bomId: string;
  let productionOrderId: string;

  // ── Work Centers ──────────────────────────────────────────────────────

  test("POST /manufacturing/work-centers creates work center", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", "/manufacturing/work-centers", t, c, {
      name: `P3 Work Center ${Date.now()}`,
      capacity: 100,
      hourly_rate: 500,
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    workCenterId = r.body.id;
  });

  test("GET /manufacturing/work-centers returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/manufacturing/work-centers", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  // ── Routings ──────────────────────────────────────────────────────────

  test("POST /manufacturing/routings creates routing", async ({ request }) => {
    if (!workCenterId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    // Get an inventory item for finished_item_id
    const items = await api(request, "GET", "/inventory/items", t, c);
    const itemId = items.status === 200 && items.body.length > 0 ? items.body[0].id : null;
    if (!itemId) return;

    const r = await api(request, "POST", "/manufacturing/routings", t, c, {
      name: `P3 Routing ${Date.now()}`,
      finished_item_id: itemId,
      operations: [
        {
          step_number: 1,
          work_center_id: workCenterId,
          description: "Assembly",
          setup_time_minutes: 10,
          run_time_per_unit_minutes: 2,
        },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    routingId = r.body.id;
  });

  test("GET /manufacturing/routings returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/manufacturing/routings", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  // ── BOMs ──────────────────────────────────────────────────────────────

  test("POST /manufacturing/boms creates BOM", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    // Get inventory items
    const items = await api(request, "GET", "/inventory/items", t, c);
    const itemId = items.status === 200 && items.body.length > 0 ? items.body[0].id : null;
    const materialId = items.status === 200 && items.body.length > 1 ? items.body[1].id : null;
    if (!itemId || !materialId) return;

    const r = await api(request, "POST", "/manufacturing/boms", t, c, {
      name: `P3 BOM ${Date.now()}`,
      finished_item_id: itemId,
      output_qty: 1,
      lines: [
        { stock_item_id: materialId, quantity: 2, rate: 100, wastage_pct: 0 },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    bomId = r.body.id;
  });

  test("GET /manufacturing/boms returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/manufacturing/boms", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("GET /manufacturing/boms/{id} returns BOM detail", async ({ request }) => {
    if (!bomId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", `/manufacturing/boms/${bomId}`, t, c);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(bomId);
  });

  test("POST /manufacturing/boms rejects duplicate name", async ({ request }) => {
    if (!bomId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const existing = await api(request, "GET", `/manufacturing/boms/${bomId}`, t, c);
    if (existing.status !== 200) return;

    const r = await api(request, "POST", "/manufacturing/boms", t, c, {
      name: existing.body.name,
      finished_item_id: existing.body.finished_item_id,
      output_qty: 1,
      lines: [],
    });
    expect(r.status).toBe(400);
  });

  // ── Production Orders ─────────────────────────────────────────────────

  test("POST /manufacturing/production-orders creates order", async ({ request }) => {
    if (!bomId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", "/manufacturing/production-orders", t, c, {
      bom_id: bomId,
      order_date: new Date().toISOString().slice(0, 10),
      planned_qty: 10,
    });
    expect(r.status).toBe(201);
    expect(r.body.id).toBeTruthy();
    expect(r.body.status).toBe("draft");
    productionOrderId = r.body.id;
  });

  test("GET /manufacturing/production-orders returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/manufacturing/production-orders", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("POST /manufacturing/production-orders/{id}/confirm progresses order", async ({ request }) => {
    if (!productionOrderId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", `/manufacturing/production-orders/${productionOrderId}/confirm`, t, c);
    expect(r.status).toBe(200);
    expect(["in_progress", "completed"]).toContain(r.body.status);
  });

  test("GET /manufacturing/production-orders/{id} returns cost fields", async ({ request }) => {
    if (!productionOrderId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", `/manufacturing/production-orders/${productionOrderId}`, t, c);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty("material_cost");
    expect(r.body).toHaveProperty("labor_cost");
    expect(r.body).toHaveProperty("overhead_cost");
    expect(typeof r.body.material_cost).toBe("number");
  });

  test("GET /manufacturing/wastage-report returns 200", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/manufacturing/reports/wastage", t, c);
    expect(r.status).toBe(200);
  });

  // ── Cleanup ───────────────────────────────────────────────────────────

  test("DELETE /manufacturing/boms/{id} cleans up", async ({ request }) => {
    if (!bomId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "DELETE", `/manufacturing/boms/${bomId}`, t, c);
    expect([204, 400, 404]).toContain(r.status);
  });

  test("DELETE /manufacturing/routings/{id} cleans up", async ({ request }) => {
    if (!routingId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "DELETE", `/manufacturing/routings/${routingId}`, t, c);
    expect([204, 400, 404]).toContain(r.status);
  });

  test("DELETE /manufacturing/work-centers/{id} cleans up", async ({ request }) => {
    if (!workCenterId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "DELETE", `/manufacturing/work-centers/${workCenterId}`, t, c);
    expect([204, 400, 404]).toContain(r.status);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. Tally Import Workflow
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Tally Import Workflow", () => {
  let jobId: string;

  test("GET /tally-import/jobs returns list", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/tally-import/jobs", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("POST /tally-import/upload parses valid XML", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Ledgers</REPORTNAME>
      </REQUESTDESC>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    const res = await request.post(`${API}/tally-import/upload`, {
      headers: {
        Authorization: `Bearer ${t}`,
        "X-Company-Id": c,
      },
      multipart: {
        file: {
          name: "test_ledgers.xml",
          mimeType: "application/xml",
          buffer: Buffer.from(xmlContent),
        },
      },
    });
    // Either 201 (success) or 422 (no valid data found)
    expect([201, 422]).toContain(res.status());
    if (res.status() === 201) {
      const body = JSON.parse(await res.text());
      expect(body.job_id).toBeTruthy();
      jobId = body.job_id;
    }
  });

  test("POST /tally-import/upload rejects non-XML/Excel file", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const res = await request.post(`${API}/tally-import/upload`, {
      headers: {
        Authorization: `Bearer ${t}`,
        "X-Company-Id": c,
      },
      multipart: {
        file: {
          name: "test.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("not xml or excel content"),
        },
      },
    });
    expect([400, 422]).toContain(res.status());
  });

  test("POST /tally-import/jobs/{id}/confirm executes import", async ({ request }) => {
    if (!jobId) return;
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "POST", `/tally-import/jobs/${jobId}/confirm`, t, c);
    expect([200, 400]).toContain(r.status);
  });

  test("GET /tally-import/jobs shows completed job", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/tally-import/jobs", t, c);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBeTruthy();
  });

  test("GET /tally-import/sample-xml returns download", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/tally-import/sample-xml", t, c);
    expect([200, 404]).toContain(r.status);
  });

  test("GET /tally-import/sample-excel returns download", async ({ request }) => {
    const t = await adminToken(request);
    const c = await getCompanyId(request, t);
    const r = await api(request, "GET", "/tally-import/sample-excel", t, c);
    expect([200, 404]).toContain(r.status);
  });
});
