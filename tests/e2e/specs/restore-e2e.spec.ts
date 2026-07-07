import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:8080/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (res.status() !== 200) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).access_token as string;
}

async function waitForDbReady(request: APIRequestContext, maxAttempts = 30): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await request.get(`${API}/setup/status`);
      if (res.status() === 200) return true;
    } catch {
      // API restarting
    }
  }
  return false;
}

test.describe("API: Restore Integration (E2E)", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
  });

  test("Full restore: execute backup → pg_restore succeeds → verify all tables", async ({ request }) => {
    // Get an existing backup
    const backupsRes = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const backups = await backupsRes.json();
    expect(backups.database_backups.length).toBeGreaterThan(0);
    const testBackup = backups.database_backups[backups.database_backups.length - 1];

    // Execute restore
    const executeRes = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        database_file: testBackup.filename,
        confirm: "RESTORE",
      },
    });
    expect(executeRes.status()).toBe(200);
    expect((await executeRes.json()).status).toBe("restoring");

    // Wait for DB to be ready
    const ready = await waitForDbReady(request);
    expect(ready).toBe(true);

    // Re-login with retry (DB may still be settling)
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        token = await loginAs(request, ADMIN.email, ADMIN.password);
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }

    // Verify auth works
    const meRes = await request.get(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status()).toBe(200);
    const me = await meRes.json();
    expect(me.user.email).toBe(ADMIN.email);
    expect(me.companies.length).toBeGreaterThan(0);

    // Verify COA (ledger tables restored correctly)
    const cid = me.companies[0].id;
    const coaRes = await request.get(`${API}/coa/ledgers`, {
      headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid },
    });
    expect(coaRes.status()).toBe(200);
    const ledgers = await coaRes.json();
    expect(ledgers.length).toBeGreaterThan(0);
  });

  test("Upload with both .sql.gz and .tar.gz is accepted", async ({ request }) => {
    const { gzipSync } = await import("zlib");
    const sqlGz = gzipSync(Buffer.from("CREATE TABLE _restore_test (id INT);"));

    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        database_file: {
          name: "test-restore-both.sql.gz",
          mimeType: "application/gzip",
          buffer: sqlGz,
        },
        uploads_file: {
          name: "test-uploads.tar.gz",
          mimeType: "application/gzip",
          buffer: sqlGz,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.database_file).toBe("test-restore-both.sql.gz");
    expect(body.uploads_file).toBe("test-uploads.tar.gz");
  });

  test("Upload rejects non-superadmin", async ({ request }) => {
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `restore-e2e-test-${Date.now()}@test.example.com`,
        name: "Restore E2E Test",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const { gzipSync } = await import("zlib");
    const sqlGz = gzipSync(Buffer.from("SELECT 1"));

    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${userToken}` },
      multipart: {
        database_file: {
          name: "test.sql.gz",
          mimeType: "application/gzip",
          buffer: sqlGz,
        },
      },
    });
    expect(res.status()).toBe(403);

    // Cleanup
    const userId = (await regRes.json()).user?.id;
    if (userId) {
      await request.delete(`${API}/admin/users/${userId}/hard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});
