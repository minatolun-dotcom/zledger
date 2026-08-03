import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

async function waitForToast(page: Page) {
  await page.waitForTimeout(800);
}

test.describe("Batch Tracking — Frontend UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForURL("**/manufacturing");
    await page.waitForLoadState("networkidle");
  });

  test("Manufacturing page has Batches tab", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByRole("tab", { name: "Batches", exact: true })).toBeVisible();
  });

  test("Batches tab shows seed batches", async ({ page }) => {
    await page.getByRole("tab", { name: "Batches", exact: true }).click();
    await page.waitForTimeout(500);

    const main = page.locator("main");
    await expect(main.getByText("PCB-M-2026-001")).toBeVisible();
    await expect(main.getByRole("cell", { name: "Mouse PCB Board" }).first()).toBeVisible();
  });

  test("Create new batch", async ({ page }) => {
    await page.getByRole("tab", { name: "Batches", exact: true }).click();
    await page.waitForTimeout(500);

    await page.getByRole("button", { name: "+ New Batch" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0").last();
    await expect(modal.getByText("New Batch")).toBeVisible();

    const batchNum = `E2E-${Date.now()}`;

    // Select stock item using the MasterSelector combobox (portal dropdown).
    // The MasterSelector renders an <input role="combobox"> with a placeholder.
    const stockItemInput = modal.getByPlaceholder("Select item (must have batch tracking enabled)");
    await stockItemInput.click();
    await page.waitForTimeout(300);
    // Type to filter, then pick the option from the portal dropdown
    await stockItemInput.fill("Wireless Mouse");
    await page.waitForTimeout(200);
    await page.getByText("Wireless Mouse", { exact: true }).last().click();
    await page.waitForTimeout(300);

    // Fill batch number
    await modal.getByPlaceholder("e.g. LOT-2026-001").fill(batchNum);
    await modal.getByRole("spinbutton").last().fill("25");

    await page.getByRole("button", { name: "Create Batch" }).click();
    await waitForToast(page);

    // Verify batch appears in table
    await expect(page.getByRole("cell", { name: batchNum })).toBeVisible();
  });

  test("Filter batches by status", async ({ page }) => {
    await page.getByRole("tab", { name: "Batches", exact: true }).click();
    await page.waitForTimeout(500);

    // Status filter is a custom Select (portal dropdown), not a native <select>.
    await page.getByRole("button", { name: "All Status" }).click();
    await page.waitForTimeout(300);
    await page.locator("div").filter({ hasText: "Active" }).last().click();
    await page.waitForTimeout(500);

    // All visible batches should be active
    const statusBadges = page.locator("span").filter({ hasText: "active" });
    const count = await statusBadges.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Batch Trace — Frontend UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Batches" }).click();
    await page.waitForURL("**/batches");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Batch Trace", exact: true }).click();
  });

  test("Batch trace tab loads", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByPlaceholder("e.g. PCB-M-2026-001")).toBeVisible();
  });

  test("Trace a batch number", async ({ page }) => {
    await page.getByPlaceholder("e.g. PCB-M-2026-001").fill("PCB-M-2026-001");
    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await page.waitForTimeout(1000);

    // Should show results
    await expect(page.getByText("PCB-M-2026-001").first()).toBeVisible();
    await expect(page.getByText("Mouse PCB Board")).toBeVisible();
  });

  test("Trace non-existent batch shows empty state", async ({ page }) => {
    await page.getByPlaceholder("e.g. PCB-M-2026-001").fill("NONEXISTENT-123");
    await page.getByRole("button", { name: "Trace", exact: true }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByText('No batches found with number "NONEXISTENT-123"')).toBeVisible();
  });
});
