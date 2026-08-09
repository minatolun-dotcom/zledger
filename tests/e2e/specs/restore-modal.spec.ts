import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";
const TMP_DIR = "/tmp/zledger-restore-e2e";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function browserLogin(page: Page) {
  await page.goto("/login");
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/companies");
  await page.getByText("Apex Enterprises", { exact: true }).click();
  await page.waitForTimeout(4000);
}

test.describe("UI: Restore from Backup modal flow", () => {
  // The restore DROPS the database and re-imports it in the background;
  // API recovery (pool reconnect + ANALYZE) can take 1-2 minutes.
  test.setTimeout(300_000);

  let token: string;
  let backupFile: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);

    // Grab the newest real database backup from the volume and save it to a
    // temp file so the modal's file upload has something valid to consume.
    const res = await request.get(`${API}/admin/backups`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    // Pick the newest REAL dump: API-level restore tests upload tiny
    // throwaway .sql.gz files (e.g. `test-restore.sql.gz`) into the volume,
    // and pg_restore rejects anything that isn't a genuine PGDMP archive —
    // restoring a junk file would drop the DB then fail. Real dumps are
    // zledger_*.sql.gz and hundreds of KB.
    const newest = body.database_backups.find(
      (b: { filename: string; size_bytes: number }) =>
        /^zledger_.*\.sql\.gz$/.test(b.filename) && b.size_bytes > 100_000
    );
    expect(newest).toBeTruthy();
    expect(newest.filename).toMatch(/\.sql\.gz$/);

    const dl = await request.get(
      `${API}/admin/backups/download/${encodeURIComponent(newest.filename)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(dl.status()).toBe(200);
    const buf = await dl.body();

    mkdirSync(TMP_DIR, { recursive: true });
    backupFile = join(TMP_DIR, newest.filename);
    writeFileSync(backupFile, buf);
  });

  test("full restore flow: upload → verify → RESTORE → redirect to login", async ({
    page,
    request,
  }) => {
    await browserLogin(page);

    // Open Backup Management
    await page.goto("/admin/backups", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Backup Management", { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Click Restore → modal opens
    await page.getByRole("main").getByRole("button", { name: "Restore", exact: true }).click();
    await page.waitForSelector("text=Restore from Backup", { timeout: 8000 });

    // Upload the real backup file (hidden input with accept=".sql.gz")
    await page.setInputFiles('input[accept=".sql.gz"]', backupFile);
    await page.waitForTimeout(500);

    // Upload & Verify → confirm step
    await page.getByRole("button", { name: "Upload & Verify" }).click();
    await page.waitForSelector("text=This will overwrite all existing data", { timeout: 15000 });
    await page.waitForSelector("input[placeholder='RESTORE']", { timeout: 8000 });

    // Type the confirmation and hit the destructive Restore button (scoped
    // to the modal — the page header also has a "Restore" button).
    await page.fill("input[placeholder='RESTORE']", "RESTORE");
    await page.getByLabel("Restore from Backup").getByRole("button", { name: "Restore", exact: true }).click();

    // Restoring → done → auto-redirect to login
    await page.waitForSelector("text=Restore complete", { timeout: 30000 });
    await page.waitForURL("**/login", { timeout: 30000 });
    console.log("Redirected to /login after restore");

    // The API restarts/restores the DB in the background — wait for it to
    // come back healthy with a working login before declaring success.
    let healthy = false;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const health = await request.get(`${API}/health`);
        if (health.status() === 200) {
          const login = await request.post(`${API}/auth/login`, {
            data: { email: ADMIN.email, password: ADMIN.password },
          });
          if (login.status() === 200) {
            healthy = true;
            break;
          }
        }
      } catch {
        // API restarting — keep polling
      }
    }
    expect(healthy).toBe(true);
    console.log("API healthy and login works after restore");
  });
});
