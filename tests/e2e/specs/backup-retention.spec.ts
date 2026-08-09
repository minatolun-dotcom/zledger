import { test, expect, type APIRequestContext } from "@playwright/test";
import { execSync } from "child_process";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";
const SNAP = "/tmp/zledger-e2e-bak-snapshot";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

function docker(cmd: string): string {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe" }).trim();
}

function backupVolume(): string {
  // Use the volume the API container actually mounts (there can be a stale
  // empty `zledger_backups` left over from an older compose file — never
  // touch that one).
  return docker(
    `docker inspect zledger-api-1 --format '{{range .Mounts}}{{if eq .Destination \"/backups\"}}{{.Name}}{{end}}{{end}}'`
  );
}

function snapshotBackups() {
  const vol = backupVolume();
  docker(`mkdir -p ${SNAP}`);
  docker(
    `docker run --rm -v ${vol}:/backups:ro -v ${SNAP}:/snap alpine sh -c 'cp -a /backups/. /snap/'`
  );
}

function restoreBackups() {
  const vol = backupVolume();
  docker(
    `docker run --rm -v ${SNAP}:/snap:ro -v ${vol}:/backups alpine sh -c 'rm -rf /backups/*; cp -a /snap/. /backups/'`
  );
  // The snapshot dir is root-owned (written by a container) — clean it from
  // inside a root container; the host user cannot rm root-owned files.
  docker(
    `docker run --rm -v ${SNAP}:/snap alpine sh -c 'find /snap -mindepth 1 -delete'`
  );
  docker(`rmdir ${SNAP} 2>/dev/null || true`);
}

function createFakeOldBackups() {
  // BusyBox touch doesn't parse '10 days ago' — use an explicit timestamp
  // (2026-07-30 12:00 UTC, well outside the 1-day retention window).
  const vol = backupVolume();
  const names = "zledger_e2e_old_a.sql.gz zledger_e2e_old_b.sql.gz zledger_e2e_old_c.sql.gz";
  docker(
    `docker run --rm -v ${vol}:/backups alpine sh -c "touch -t 202607301200 /backups/${names.replace(/ /g, " /backups/")}"`
  );
}

test.describe("API: Backup Retention", () => {
  // A full backup run (pg_dump + uploads + rotation + GDrive sync) takes
  // ~40-60s; the polling loop below can wait up to 2 minutes on top of that.
  test.setTimeout(240_000);

  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);
    snapshotBackups();
  });

  test.afterAll(async ({ request }) => {
    // Restore the pre-test backup volume (the retention run pruned the real
    // old backups too — snapshot/restore keeps the user's history intact).
    restoreBackups();
    // Reset retention to the compose default.
    await request.put(`${API}/admin/backup/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { retention_days: 30 },
    });
  });

  test("old backups are pruned on the next backup run when retention is lowered", async ({
    request,
  }) => {
    // Seed fake "old" backups into the volume so rotation has something to prune.
    createFakeOldBackups();

    // The fakes appear in the status listing (they match *.sql.gz).
    let res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let body = await res.json();
    const fakeNames = body.database_backups
      .map((b: { filename: string }) => b.filename)
      .filter((n: string) => n.startsWith("zledger_e2e_old_"));
    expect(fakeNames.length).toBe(3);

    // Lower retention to 1 day via the UI's settings endpoint.
    res = await request.put(`${API}/admin/backup/settings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { retention_days: 1 },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).retention_days).toBe(1);

    // Trigger a real backup — backup.sh rotates with the lowered retention.
    res = await request.post(`${API}/admin/backup/trigger`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).status).toBe("started");

    // Poll progress until done.
    let progress = "";
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await request.get(`${API}/admin/backup/progress`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (p.status() === 200) {
        progress = (await p.json()).status;
        if (progress === "done" || progress === "error") break;
      }
    }
    expect(progress).toBe("done");

    // The fake old backups must be gone; a fresh real backup must exist.
    res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    body = await res.json();
    const allNames = body.database_backups.map((b: { filename: string }) => b.filename);
    expect(allNames.some((n: string) => n.startsWith("zledger_e2e_old_"))).toBe(false);
    expect(allNames.length).toBeGreaterThan(0);
    // The newest backup was just created (fresh mtime).
    expect(body.database_backups[0].filename).not.toMatch(/^zledger_e2e_old_/);
  });
});
