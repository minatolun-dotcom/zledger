import { test, expect, type APIRequestContext } from "@playwright/test";
import { execSync } from "child_process";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

function docker(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
}

function backupVolume(): string {
  // The volume the API container actually mounts (never a stale leftover).
  return docker(
    `docker inspect zledger-api-1 --format '{{range .Mounts}}{{if eq .Destination \"/backups\"}}{{.Name}}{{end}}{{end}}'`
  );
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

  test("Backup status includes volume disk usage", async ({ request }) => {
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.disk_usage).not.toBeNull();
    expect(typeof body.disk_usage.total).toBe("number");
    expect(typeof body.disk_usage.used).toBe("number");
    expect(typeof body.disk_usage.free).toBe("number");
    expect(body.disk_usage.total).toBeGreaterThan(0);
    expect(body.disk_usage.used).toBeGreaterThanOrEqual(0);
    // Sanity: used + free fits within total (allow 1 byte for rounding).
    expect(body.disk_usage.used + body.disk_usage.free).toBeLessThanOrEqual(
      body.disk_usage.total + 1
    );
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

test.describe("API: Backup Prune", () => {
  // Snapshot + restore of the backup volume takes a while.
  test.setTimeout(240_000);

  const SNAP = "/tmp/zledger-e2e-prune-snapshot";
  const OLD = "e2e_prune_old.sql.gz";
  const NEW = "e2e_prune_new.sql.gz";
  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
    // Snapshot the volume so a lowered-retention prune can never destroy the
    // user's real backup history — restored in afterAll.
    const vol = backupVolume();
    docker(`mkdir -p ${SNAP}`);
    docker(`docker run --rm -v ${vol}:/backups:ro -v ${SNAP}:/snap alpine sh -c 'cp -a /backups/. /snap/'`);
  });

  test.afterAll(async ({ request }) => {
    const vol = backupVolume();
    docker(`docker run --rm -v ${SNAP}:/snap:ro -v ${vol}:/backups alpine sh -c 'rm -rf /backups/*; cp -a /snap/. /backups/'`);
    docker(`docker run --rm -v ${SNAP}:/snap alpine sh -c 'find /snap -mindepth 1 -delete'`);
    docker(`rmdir ${SNAP} 2>/dev/null || true`);
    // Reset retention to the compose default.
    await request.put(`${API}/admin/backup/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { retention_days: 30 },
    });
  });

  test("POST /admin/backups/prune removes only backups older than retention", async ({
    request,
  }) => {
    // Seed two throwaway backups directly into the volume; backdate one so
    // only it is beyond the 1-day retention cutoff. Names avoid the zledger_
    // prefix so leftovers can never be picked up as "real" backups.
    const vol = backupVolume();
    docker(
      `docker run --rm -v ${vol}:/backups alpine sh -c "touch -t 202001010000 /backups/${OLD}; touch /backups/${NEW}"`
    );

    // Both appear in the list.
    let res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let names = (await res.json()).database_backups.map((b: { filename: string }) => b.filename);
    expect(names).toContain(OLD);
    expect(names).toContain(NEW);

    // Lower retention to 1 day, then prune.
    res = await request.put(`${API}/admin/backup/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { retention_days: 1 },
    });
    expect(res.status()).toBe(200);

    res = await request.post(`${API}/admin/backups/prune`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.pruned).toContain(OLD);
    expect(body.pruned).not.toContain(NEW);
    // Real backups older than 1 day are pruned too (the volume snapshot in
    // beforeAll/afterAll restores them), so the total count is junk(1) + N.
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.retention_days).toBe(1);

    // The old file is gone from the list; the new one remains.
    res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    names = (await res.json()).database_backups.map((b: { filename: string }) => b.filename);
    expect(names).not.toContain(OLD);
    expect(names).toContain(NEW);
  });
});
