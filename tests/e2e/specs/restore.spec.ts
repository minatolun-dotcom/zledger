import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

test.describe("API: Setup & Restore", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
  });

  // ── Setup Status ──────────────────────────────────────────────────────

  test("GET /setup/status returns instance status", async ({ request }) => {
    const res = await request.get(`${API}/setup/status`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("has_users");
    expect(body).toHaveProperty("has_companies");
    expect(typeof body.has_users).toBe("boolean");
    expect(typeof body.has_companies).toBe("boolean");
  });

  test("Setup status is public (no auth required)", async ({ request }) => {
    const res = await request.get(`${API}/setup/status`);
    expect(res.status()).toBe(200);
  });

  test("Setup status shows users exist on running instance", async ({ request }) => {
    const res = await request.get(`${API}/setup/status`);
    const body = await res.json();
    expect(body.has_users).toBe(true);
  });

  // ── Restore Upload ────────────────────────────────────────────────────

  test("POST /admin/restore/upload rejects non-superadmin", async ({ request }) => {
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `restore-test-${Date.now()}@test.example.com`,
        name: "Restore Test User",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${userToken}` },
      multipart: {
        database_file: {
          name: "test.sql.gz",
          mimeType: "application/gzip",
          buffer: Buffer.from("not a real backup"),
        },
      },
    });
    expect(res.status()).toBe(403);

    // Cleanup
    const userId = (await regRes.json()).user?.id;
    if (userId) {
      const adminRes = await request.post(`${API}/auth/login`, {
        data: { email: ADMIN.email, password: ADMIN.password },
      });
      const adminTok = (await adminRes.json()).access_token;
      await request.delete(`${API}/admin/users/${userId}/hard`, {
        headers: { Authorization: `Bearer ${adminTok}` },
      });
    }
  });

  test("POST /admin/restore/upload rejects non-.sql.gz file", async ({ request }) => {
    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        database_file: {
          name: "backup.txt",
          mimeType: "text/plain",
          buffer: Buffer.from("not a backup"),
        },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain(".sql.gz");
  });

  test("POST /admin/restore/upload rejects non-gzip content", async ({ request }) => {
    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        database_file: {
          name: "backup.sql.gz",
          mimeType: "application/gzip",
          buffer: Buffer.from("this is not gzip compressed data"),
        },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("not a valid gzip");
  });

  test("POST /admin/restore/upload accepts valid gzip file", async ({ request }) => {
    // Create a valid gzip file in memory
    const { gzipSync } = await import("zlib");
    const sqlContent = "CREATE TABLE test_restore (id INT PRIMARY KEY);";
    const gzipped = gzipSync(Buffer.from(sqlContent));

    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        database_file: {
          name: "test-restore.sql.gz",
          mimeType: "application/gzip",
          buffer: gzipped,
        },
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.database_file).toBe("test-restore.sql.gz");
    expect(body.database_size).toBe(gzipped.length);
    expect(body.uploads_file).toBeNull();
    expect(body.uploads_size).toBeNull();
  });

  test("POST /admin/restore/upload rejects non-.tar.gz uploads file", async ({ request }) => {
    const { gzipSync } = await import("zlib");
    const gzipped = gzipSync(Buffer.from("CREATE TABLE t (id INT);"));

    const res = await request.post(`${API}/admin/restore/upload`, {
      headers: { Authorization: `Bearer ${token}` },
      multipart: {
        database_file: {
          name: "backup.sql.gz",
          mimeType: "application/gzip",
          buffer: gzipped,
        },
        uploads_file: {
          name: "uploads.zip",
          mimeType: "application/zip",
          buffer: Buffer.from("not tar.gz"),
        },
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain(".tar.gz");
  });

  // ── Restore Execute ───────────────────────────────────────────────────

  test("POST /admin/restore/execute rejects missing confirm", async ({ request }) => {
    const res = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        database_file: "test.sql.gz",
        confirm: "WRONG",
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.detail).toContain("RESTORE");
  });

  test("POST /admin/restore/execute rejects nonexistent file", async ({ request }) => {
    const res = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        database_file: "nonexistent-backup-12345.sql.gz",
        confirm: "RESTORE",
      },
    });
    expect(res.status()).toBe(404);
    const body = await res.json();
    expect(body.detail).toContain("not found");
  });

  test("POST /admin/restore/execute rejects non-superadmin", async ({ request }) => {
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `restore-exec-test-${Date.now()}@test.example.com`,
        name: "Restore Exec Test",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const res = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${userToken}` },
      data: {
        database_file: "test.sql.gz",
        confirm: "RESTORE",
      },
    });
    expect(res.status()).toBe(403);

    // Cleanup
    const userId = (await regRes.json()).user?.id;
    if (userId) {
      const adminRes = await request.post(`${API}/auth/login`, {
        data: { email: ADMIN.email, password: ADMIN.password },
      });
      const adminTok = (await adminRes.json()).access_token;
      await request.delete(`${API}/admin/users/${userId}/hard`, {
        headers: { Authorization: `Bearer ${adminTok}` },
      });
    }
  });

  // ── Backup Status with GDrive ─────────────────────────────────────────

  test("Backup status includes gdrive_sync field", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("gdrive_sync");
    // gdrive_sync is null when not configured, or an object when configured
    if (body.gdrive_sync !== null) {
      expect(body.gdrive_sync).toHaveProperty("gdrive_enabled");
      expect(body.gdrive_sync).toHaveProperty("last_sync_status");
    }
  });
});
