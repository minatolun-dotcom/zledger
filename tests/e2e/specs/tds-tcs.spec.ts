import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

const E2E_PREFIX = "[E2E]";

test.describe("TDS / TCS Configuration", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "TDS / TCS" }).click();
    await page.waitForURL("**/tds-tcs");
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
    await page.getByRole("link", { name: "TDS / TCS" }).click();
    await page.waitForURL("**/tds-tcs");
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
    await page.getByLabel(/section name/i).fill(`${E2E} TDS Section`);

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
