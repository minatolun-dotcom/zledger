import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

test.describe("API: Backup Service", () => {
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
  });

  test("GET /admin/backups returns backup status", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("backup_dir");
    expect(body).toHaveProperty("database_backups");
    expect(body).toHaveProperty("uploads_backups");
    expect(body).toHaveProperty("total_backups");
    expect(Array.isArray(body.database_backups)).toBe(true);
    expect(Array.isArray(body.uploads_backups)).toBe(true);
  });

  test("Backup directory contains at least one database backup", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.database_backups.length).toBeGreaterThan(0);
  });

  test("Database backup has valid structure", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const backup = body.database_backups[body.database_backups.length - 1];
    expect(backup).toHaveProperty("filename");
    expect(backup).toHaveProperty("size_bytes");
    expect(backup).toHaveProperty("created_at");
    expect(backup).toHaveProperty("type", "database");
    expect(backup.filename).toMatch(/^zledger_.*\.sql\.gz$/);
    expect(backup.size_bytes).toBeGreaterThan(0);
  });

  test("Uploads backup has valid structure", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const backup = body.uploads_backups[body.uploads_backups.length - 1];
    expect(backup).toHaveProperty("filename");
    expect(backup).toHaveProperty("size_bytes");
    expect(backup).toHaveProperty("created_at");
    expect(backup).toHaveProperty("type", "uploads");
    expect(backup.filename).toMatch(/^zledger_uploads_.*\.tar\.gz$/);
    expect(backup.size_bytes).toBeGreaterThan(0);
  });

  test("Total backups count matches individual counts", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    expect(body.total_backups).toBe(
      body.database_backups.length + body.uploads_backups.length
    );
  });

  test("Non-superadmin cannot access backup status", async ({ request }) => {
    // Register a regular user
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `backup-test-${Date.now()}@test.example.com`,
        name: "Backup Test User",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${userToken}` },
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

  test("Backup files are present and have valid timestamps", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const backups = body.database_backups;
    for (const backup of backups) {
      expect(new Date(backup.created_at).getTime()).toBeGreaterThan(0);
    }
  });

  test("DELETE /admin/backups/{filename} removes a single backup", async ({ request }) => {
    // Create a throwaway valid-gzip file in the volume via the restore upload
    // endpoint (validates gzip + writes into the backup dir), then delete it
    // through the new endpoint and confirm it is gone everywhere.
    // The name intentionally avoids the `zledger_` prefix: if an assertion
    // fails mid-test, a leftover junk file must never be picked up by other
    // specs as a "real" newest backup (restore-modal selects zledger dumps).
    const { gzipSync } = await import("zlib");
    const gzipped = gzipSync(Buffer.from("CREATE TABLE del_test (id INT);"));
    const JUNK = "e2e_delete_me.sql.gz";

    try {
      const upload = await request.post(`${API}/admin/restore/upload`, {
        headers: { Authorization: `Bearer ${token}` },
        multipart: {
          database_file: {
            name: JUNK,
            mimeType: "application/gzip",
            buffer: gzipped,
          },
        },
      });
      expect(upload.status()).toBe(200);

      const res = await request.delete(`${API}/admin/backups/${JUNK}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.deleted).toBe(JUNK);

      // Gone from the status list
      const list = await request.get(`${API}/admin/backups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = await list.json();
      expect(status.database_backups.some((b: any) => b.filename === JUNK)).toBe(false);

      // Deleting again → 404
      const again = await request.delete(`${API}/admin/backups/${JUNK}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(again.status()).toBe(404);
    } finally {
      // Best-effort cleanup if any assertion failed before the delete ran
      await request
        .delete(`${API}/admin/backups/${JUNK}`, { headers: { Authorization: `Bearer ${token}` } })
        .catch(() => {});
    }
  });

  test("Non-superadmin cannot delete backups", async ({ request }) => {
    const regRes = await request.post(`${API}/auth/register`, {
      data: {
        email: `backup-del-${Date.now()}@test.example.com`,
        name: "Backup Delete User",
        password: "test12345",
      },
    });
    const userToken = (await regRes.json()).access_token;

    const res = await request.delete(`${API}/admin/backups/zledger_something.sql.gz`, {
      headers: { Authorization: `Bearer ${userToken}` },
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
});
