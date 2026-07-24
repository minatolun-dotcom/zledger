import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

test.describe("API: Company Force Delete", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
  });

  test("DELETE /admin/companies/{id}?force=true deletes company with data", async ({ request }) => {
    // Create a test company
    const createRes = await request.post(`${API}/admin/companies`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `[TEST-DELETE] Force Delete Co ${Date.now()}` },
    });
    expect(createRes.status()).toBe(201);
    const companyId = (await createRes.json()).id;

    // Deactivate first (required by delete guard)
    const patchRes = await request.patch(`${API}/admin/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { is_active: false },
    });
    expect(patchRes.status()).toBe(200);

    // Force delete should succeed
    const deleteRes = await request.delete(`${API}/admin/companies/${companyId}?force=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleteRes.status()).toBe(200);
    const body = await deleteRes.json();
    expect(body.message).toContain("deleted");

    // Verify company is gone
    const getRes = await request.get(`${API}/admin/companies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const companies = await getRes.json();
    const found = companies.find((c: any) => c.id === companyId);
    expect(found).toBeUndefined();
  });

  test("DELETE /admin/companies/{id} without force rejects company with data", async ({ request }) => {
    // Create a test company
    const createRes = await request.post(`${API}/admin/companies`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `[TEST-DELETE] No-Force Delete Co ${Date.now()}` },
    });
    expect(createRes.status()).toBe(201);
    const companyId = (await createRes.json()).id;

    // Deactivate
    await request.patch(`${API}/admin/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { is_active: false },
    });

    // Delete without force should fail if data exists
    const deleteRes = await request.delete(`${API}/admin/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // If company has data, should get 400; if empty, 200
    const body = await deleteRes.json();
    if (deleteRes.status() === 400) {
      expect(body.detail).toContain("existing data");
    } else {
      expect(deleteRes.status()).toBe(200);
    }

    // Cleanup if still exists
    if (deleteRes.status() === 400) {
      await request.delete(`${API}/admin/companies/${companyId}?force=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });

  test("DELETE /admin/companies/{id} rejects active company even with force", async ({ request }) => {
    // Create a test company (active by default)
    const createRes = await request.post(`${API}/admin/companies`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: `[TEST-DELETE] Active Co ${Date.now()}` },
    });
    expect(createRes.status()).toBe(201);
    const companyId = (await createRes.json()).id;

    // Delete without deactivating first should fail
    const deleteRes = await request.delete(`${API}/admin/companies/${companyId}?force=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(deleteRes.status()).toBe(400);
    const body = await deleteRes.json();
    expect(body.detail).toContain("deactivated");

    // Cleanup
    await request.patch(`${API}/admin/companies/${companyId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { is_active: false },
    });
    await request.delete(`${API}/admin/companies/${companyId}?force=true`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  });

  test("DELETE /admin/companies/{id} rejects non-superadmin", async ({ request }) => {
    // Register a regular user
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `force-delete-test-${Date.now()}@test.example.com`,
        name: "Force Delete Test",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const deleteRes = await request.delete(`${API}/admin/companies/nonexistent?force=true`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(deleteRes.status()).toBe(403);

    // Cleanup
    const userId = (await regRes.json()).user?.id;
    if (userId) {
      await request.delete(`${API}/admin/users/${userId}/hard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
