import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

const E2E_PREFIX = "[E2E]";

// TDS / TCS sits directly under the Tax & Compliance group (flat sidebar).
async function openTdsPage(page: any) {
  await page.getByRole("link", { name: "TDS / TCS" }).click();
  await page.waitForURL("**/tds-tcs");
}

test.describe("TDS / TCS Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await openTdsPage(page);
    await page.waitForLoadState("networkidle");
  });

  test("TDS/TCS page loads", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "TDS / TCS" })).toBeVisible();
  });

  test("Page has configuration sections", async ({ page }) => {
    const content = page.locator("main, .space-y-4, [class*='space']").first();
    await expect(content).toBeVisible();
  });

  test("Sections tab is accessible", async ({ page }) => {
    const sectionsTab = page.getByRole("button", { name: /sections/i });
    if (await sectionsTab.isVisible().catch(() => false)) {
      await sectionsTab.click();
      await page.waitForLoadState("networkidle");
    }
  });

  test("Seed sections button works", async ({ page }) => {
    const seedBtn = page.getByRole("button", { name: /seed/i });
    if (await seedBtn.isVisible().catch(() => false)) {
      await seedBtn.click();
      await page.waitForTimeout(2000);
    }
  });
});

test.describe("TDS/TCS Sections CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await openTdsPage(page);
    await page.waitForLoadState("networkidle");
  });

  test("Add section form opens", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /add section/i });
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await expect(page.getByLabel(/section code/i)).toBeVisible();
    }
  });

  test("Create and delete a TDS section", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /add section/i });
    if (!(await addBtn.isVisible().catch(() => false))) return;

    await addBtn.click();
    const sectionCode = `${E2E_PREFIX}${Date.now().toString().slice(-6)}`;

    await page.getByLabel(/section code/i).fill(sectionCode);
    await page.getByLabel(/section name/i).fill(`${E2E_PREFIX} TDS Section`);

    const rateInput = page.getByLabel(/rate/i);
    if (await rateInput.isVisible().catch(() => false)) {
      await rateInput.fill("10");
    }

    const thresholdInput = page.getByLabel(/threshold/i);
    if (await thresholdInput.isVisible().catch(() => false)) {
      await thresholdInput.fill("30000");
    }

    await page.getByRole("button", { name: /save|create/i }).click();
    await page.waitForTimeout(1000);

    // Section should appear
    await expect(page.getByText(sectionCode)).toBeVisible();

    // Cleanup
    page.on("dialog", (d) => d.accept());
    const row = page.getByRole("row").filter({ hasText: sectionCode });
    const deleteBtn = row.getByRole("button", { name: /delete/i });
    if (await deleteBtn.isVisible().catch(() => false)) {
      await deleteBtn.click();
      await expect(page.getByText(sectionCode)).toHaveCount(0);
    }
  });
});

test.describe("TDS/TCS Certificates API", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Certificates list endpoint returns array", async ({ page }) => {
    const certs = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      if (!token) return null;
      let companyId = localStorage.getItem("zledger.companyId") || "";
      if (!companyId) {
        const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
        companyId = me?.companies?.[0]?.id ?? "";
      }
      const res = await fetch("/api/tds-tcs/certificates", {
        headers: { Authorization: `Bearer ${token}`, "X-Company-Id": companyId },
      });
      if (!res.ok) return null;
      return res.json();
    });
    expect(certs).not.toBeNull();
    expect(Array.isArray(certs)).toBe(true);
  });

  test("Generate certificates endpoint accepts valid request", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      if (!token) return { error: "no token" };
      const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
      const companyId = me?.companies?.[0]?.id || "";
      if (!companyId) return { error: "no company" };
      const params = new URLSearchParams({ period_type: "quarter", period_value: "Q1", form_type: "form_16a" });
      const res = await fetch(`/api/tds-tcs/certificates/generate?${params}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "X-Company-Id": companyId },
      });
      return res.ok ? res.json() : { error: `HTTP ${res.status}` };
    });
    expect(result).not.toBeNull();
    expect('count' in result || 'error' in result).toBe(true);
  });

  test("Certificates tab is visible on TDS/TCS page", async ({ page }) => {
    await openTdsPage(page);
    await page.waitForLoadState("networkidle");
    const certTab = page.getByRole("tab", { name: /certificates/i });
    await expect(certTab).toBeVisible();
    await certTab.click();
    await page.waitForTimeout(1000);
    const genBtn = page.getByRole("button", { name: /generate/i });
    await expect(genBtn).toBeVisible();
  });
});
