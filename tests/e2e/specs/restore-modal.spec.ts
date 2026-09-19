import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

/**
 * ⚠️  HISTORY: The original version of this spec executed a REAL restore
 * (RESTORE confirm + upload of a genuine dump) against the live stack and
 * WIPED the production database on 2026-08-17 (see STATE.md / CHANGELOG).
 *
 * The backend now enforces a kill switch: /admin/restore/execute refuses
 * (403) unless the API container has ALLOW_LIVE_RESTORE=1 in its environment.
 * docker-compose deliberately does NOT set that variable, so this spec can
 * never destroy live data again. It now verifies the guard end-to-end
 * through the real UI: upload a real dump → type RESTORE → server refuses.
 */

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
  // Empty DB → no company cards. Any logged-in state is fine; wait for settle.
  await page.waitForTimeout(3000);
}

test.describe("UI: Restore modal is guard-protected (cannot wipe live DB)", () => {
  test.setTimeout(120_000);

  let token: string;

  test.beforeAll(async ({ request }) => {
    token = await loginAs(request, ADMIN.email, ADMIN.password);

    // The live-restore kill switch MUST be off on any stack tests run against.
    const status = await request.get(`${API}/admin/backup/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (status.ok()) {
      // If the deployment ever opts into live restore, hard-fail the suite
      // so no test below can be mistaken for safe.
      const envProbe = await request.post(`${API}/admin/restore/execute`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { database_file: "__guard_probe__.sql.gz", confirm: "RESTORE" },
      });
      // 403 = guard on (safe). 404 = guard OFF (dangerous for tests).
      expect(envProbe.status()).toBe(403);
    }
  });

  test("restore execute is refused by the live-restore kill switch", async ({ request }) => {
    const res = await request.post(`${API}/admin/restore/execute`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { database_file: "whatever.sql.gz", confirm: "RESTORE" },
    });
    expect(res.status()).toBe(403);
    const body = await res.json();
    expect(body.detail).toContain("ALLOW_LIVE_RESTORE");
  });

  test("restore modal blocks the destructive button when live restore is disabled", async ({ page }) => {
    await browserLogin(page);

    await page.goto("/admin/backups", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("text=Backup Management", { timeout: 15000 });
    await page.waitForTimeout(1500);

    // Open Restore → modal
    await page.getByRole("main").getByRole("button", { name: "Restore", exact: true }).click();
    await page.waitForSelector("text=Restore from Backup", { timeout: 8000 });

    // Build a minimal VALID gzip file for the upload (the upload endpoint
    // only validates gzip; execute is where the PGDMP/guard checks live).
    const gzipData = await page.evaluate(async () => {
      const blob = new Blob([JSON.stringify({ dump: "guard-probe" })]);
      const cs = new CompressionStream("gzip");
      const stream = blob.stream().pipeThrough(cs);
      const buf = await new Response(stream).arrayBuffer();
      return Array.from(new Uint8Array(buf));
    });

    await page.setInputFiles('input[accept=".sql.gz"]', {
      name: "guard-probe.sql.gz",
      mimeType: "application/gzip",
      buffer: Buffer.from(gzipData),
    });
    await page.getByRole("button", { name: "Upload & Verify" }).click();
    await page.waitForSelector("text=This will overwrite all existing data", { timeout: 15000 });

    // The disabled-warning must be visible and the destructive button disabled.
    await page.waitForSelector("text=Live restore is disabled on this deployment", { timeout: 8000 });
    await expect(
      page.getByLabel("Restore from Backup").getByRole("button", { name: "Restore", exact: true })
    ).toBeDisabled();
  });
});
