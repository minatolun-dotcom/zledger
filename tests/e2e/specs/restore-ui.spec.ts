import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Restore via UI: User Workflow", () => {
  test("Upload backup file from browser and verify API accepts it", async ({ page }) => {
    await loginAsAdmin(page);

    const result = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      if (!token) return { error: "no token" };

      // Create a minimal gzip file
      const encoder = new TextEncoder();
      const data = encoder.encode("SELECT 1;");
      const compressedStream = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
      const response = new Response(compressedStream);
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      // Upload only (do NOT execute — that would destroy the DB)
      const form = new FormData();
      form.append("database_file", new Blob([bytes], { type: "application/gzip" }), "test-browser.sql.gz");
      const uploadRes = await fetch("/api/admin/restore/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const uploadBody = await uploadRes.json();

      return { status: uploadRes.status, body: uploadBody };
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(200);
    expect(result.body?.database_file).toBe("test-browser.sql.gz");
    expect(result.body?.database_size).toBeGreaterThan(0);
  });

  test("Upload rejects non-.sql.gz file from browser", async ({ page }) => {
    await loginAsAdmin(page);

    const result = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      if (!token) return { error: "no token" };

      // Create a non-gzip file
      const blob = new Blob(["not a backup"], { type: "text/plain" });
      const form = new FormData();
      form.append("database_file", blob, "backup.txt");
      const res = await fetch("/api/admin/restore/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body?.detail).toContain(".sql.gz");
  });

  test("Upload rejects non-gzip content from browser", async ({ page }) => {
    await loginAsAdmin(page);

    const result = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      if (!token) return { error: "no token" };

      // Create a .sql.gz file that isn't actually gzip
      const blob = new Blob(["not gzip data"], { type: "application/gzip" });
      const form = new FormData();
      form.append("database_file", blob, "fake.sql.gz");
      const res = await fetch("/api/admin/restore/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(400);
    expect(result.body?.detail).toContain("not a valid gzip");
  });

  test("Upload rejects non-superadmin from browser", async ({ page }) => {
    await loginAsAdmin(page);

    const result = await page.evaluate(async () => {
      // Register a regular user
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: `restore-ui-test-${Date.now()}@test.example.com`,
          name: "Restore UI Test",
          password: "test12345",
        }),
      });
      const regBody = await regRes.json();
      const userToken = regBody.access_token;

      // Try restore upload as regular user
      const encoder = new TextEncoder();
      const data = encoder.encode("SELECT 1;");
      const blob = new Blob([data]).stream().pipeThrough(new CompressionStream("gzip"));
      const response = new Response(blob);
      const gzBlob = await response.blob();

      const form = new FormData();
      form.append("database_file", gzBlob, "test.sql.gz");
      const res = await fetch("/api/admin/restore/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken}` },
        body: form,
      });
      return { status: res.status };
    });

    expect(result.status).toBe(403);
  });
});
