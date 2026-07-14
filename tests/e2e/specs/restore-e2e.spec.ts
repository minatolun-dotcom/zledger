import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  if (res.status() !== 200) {
    throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()).access_token as string;
}

test.describe("API: Restore Integration (E2E)", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
  });

  // Triggers a fresh backup of the pristine zledger_test, restores it, and
  // verifies the DB comes back with data. The API's connection pool uses
  // pool_pre_ping, so api_e2e transparently reconnects after the drop/recreate.
  test("Full restore: execute backup → pg_restore succeeds → verify all tables", { timeout: 300000 }, async ({ request }) => {
    // Trigger a fresh backup so we restore known-good demo data.
    const before = await (await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    })).json();
    const beforeNames = new Set(before.database_backups.map((b: { filename: string }) => b.filename));
    const triggerRes = await request.post(`${API}/admin/backup/trigger`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(triggerRes.status()).toBe(200);

    let backupFile = "";
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const list = await (await request.get(`${API}/admin/backups`, {
        headers: { Authorization: `Bearer ${token}` },
      })).json();
      const newest = list.database_backups
        .slice()
        .sort((a: { filename: string }, b: { filename: string }) => (a.filename < b.filename ? 1 : -1))[0];
      if (newest && !beforeNames.has(newest.filename)) {
        backupFile = newest.filename;
        break;
      }
    }
    expect(backupFile).toBeTruthy();

    // Execute restore
    const executeRes = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        database_file: backupFile,
        confirm: "RESTORE",
      },
    });
    expect(executeRes.status()).toBe(200);
    expect((await executeRes.json()).status).toBe("restoring");

    // Wait until the database is fully restored. Poll login AND /auth/me:
    // pg_restore runs after CREATE DATABASE, so a bare login can succeed in a
    // transitional window while /auth/me still 500s. Require both to be 200.
    let restoredToken = "";
    for (let attempt = 0; attempt < 90; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const t = await loginAs(request, ADMIN.email, ADMIN.password);
        const me = await request.get(`${API}/auth/me`, {
          headers: { Authorization: `Bearer ${t}` },
        });
        if (me.status() === 200) {
          restoredToken = t;
          break;
        }
      } catch {
        // still restoring
      }
    }
    expect(restoredToken).toBeTruthy();
    token = restoredToken;

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
