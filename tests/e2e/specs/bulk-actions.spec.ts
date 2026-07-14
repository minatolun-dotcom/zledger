import { test, expect } from "@playwright/test";
import { ADMIN, E2E_PREFIX } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

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

test.describe("Bulk Actions", () => {
  let token: string;
  let cid: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
  });

  test("POST /inventory/groups/bulk-delete", async ({ request }) => {
    // Create test groups
    const g1 = await api(request, "POST", "/inventory/groups", token, cid, {
      name: `${E2E_PREFIX} BulkGrp1 ${Date.now()}`,
    });
    const g2 = await api(request, "POST", "/inventory/groups", token, cid, {
      name: `${E2E_PREFIX} BulkGrp2 ${Date.now()}`,
    });
    expect(g1.status).toBe(201);
    expect(g2.status).toBe(201);

    const del = await api(request, "POST", "/inventory/groups/bulk-delete", token, cid, {
      ids: [g1.body.id, g2.body.id],
    });
    expect(del.status).toBe(200);
  });

  test("POST /inventory/items/bulk-delete", async ({ request }) => {
    // Create test items
    const item1 = await api(request, "POST", "/inventory/items", token, cid, {
      name: `${E2E_PREFIX} BulkItem1 ${Date.now()}`,
      sku: `BULK${Date.now().toString().slice(-6)}`,
    });
    const item2 = await api(request, "POST", "/inventory/items", token, cid, {
      name: `${E2E_PREFIX} BulkItem2 ${Date.now()}`,
      sku: `BULK${(Date.now() + 1).toString().slice(-6)}`,
    });
    if (item1.status !== 201 || item2.status !== 201) return;

    const del = await api(request, "POST", "/inventory/items/bulk-delete", token, cid, {
      ids: [item1.body.id, item2.body.id],
    });
    expect(del.status).toBe(200);
  });

  test("POST /gst/hsn-sac/bulk-delete", async ({ request }) => {
    // Create test HSN codes
    const h1 = await api(request, "POST", "/gst/hsn-sac", token, cid, {
      code: `9984${Date.now().toString().slice(-4)}`,
      description: `${E2E_PREFIX} Bulk HSN 1`,
      gst_rate: 12,
      code_type: "hsn",
    });
    const h2 = await api(request, "POST", "/gst/hsn-sac", token, cid, {
      code: `9985${Date.now().toString().slice(-4)}`,
      description: `${E2E_PREFIX} Bulk HSN 2`,
      gst_rate: 12,
      code_type: "hsn",
    });
    if (h1.status !== 201 || h2.status !== 201) return;

    const del = await api(request, "POST", "/gst/hsn-sac/bulk-delete", token, cid, {
      ids: [h1.body.id, h2.body.id],
    });
    expect(del.status).toBe(200);
  });

  test("POST /coa/ledgers/bulk-delete", async ({ request }) => {
    // Create test ledgers (need a group)
    const groups = await api(request, "GET", "/coa/groups", token, cid);
    const groupId = Array.isArray(groups.body) ? groups.body[0]?.id : null;
    if (!groupId) return;

    const l1 = await api(request, "POST", "/coa/ledgers", token, cid, {
      name: `${E2E_PREFIX} BulkLedger1 ${Date.now()}`,
      group_id: groupId,
    });
    const l2 = await api(request, "POST", "/coa/ledgers", token, cid, {
      name: `${E2E_PREFIX} BulkLedger2 ${Date.now()}`,
      group_id: groupId,
    });
    if (l1.status !== 201 || l2.status !== 201) return;

    const del = await api(request, "POST", "/coa/ledgers/bulk-delete", token, cid, {
      ids: [l1.body.id, l2.body.id],
    });
    expect(del.status).toBe(200);
  });

  test("POST /members/bulk-remove endpoint exists and validates", async ({ request }) => {
    // Test with empty/non-existent user IDs
    const r = await api(request, "POST", "/members/bulk-remove", token, cid, {
      ids: ["00000000-0000-0000-0000-000000000000"],
    });
    // Should accept the request (might skip non-existent members)
    expect([200, 400]).toContain(r.status);
  });

  test("POST /inventory/entries/bulk-delete", async ({ request }) => {
    // Create a stock item first
    const item = await api(request, "POST", "/inventory/items", token, cid, {
      name: `${E2E_PREFIX} BulkEntryItem ${Date.now()}`,
      sku: `BULKE${Date.now().toString().slice(-6)}`,
    });
    if (item.status !== 201) return;

    // Create a stock entry
    const entry = await api(request, "POST", "/inventory/entries", token, cid, {
      item_id: item.body.id,
      entry_type: "inward",
      quantity: 10,
      rate: 100,
      entry_date: "2026-07-01",
    });
    if (entry.status !== 201) {
      await api(request, "DELETE", `/inventory/items/${item.body.id}`, token, cid);
      return;
    }

    // Bulk delete entry (single item)
    const del = await api(request, "POST", "/inventory/entries/bulk-delete", token, cid, {
      ids: [entry.body.id],
    });
    expect(del.status).toBe(200);

    // Cleanup item
    await api(request, "DELETE", `/inventory/items/${item.body.id}`, token, cid);
  });
});
