import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Tally Import", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/tally-import");
    await page.waitForLoadState("networkidle");
  });

  test("Tally Import page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Data Import / Export" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Import" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "History" })).toBeVisible();
  });

  test("Upload section is visible", async ({ page }) => {
    await page.getByRole("button", { name: "Tally Import" }).click();
    await expect(page.getByRole("heading", { name: "Upload Tally Data" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test("Upload & Preview button is not visible without file", async ({ page }) => {
    await page.getByRole("button", { name: "CSV / Excel Import" }).click();
    // Without a file selected, the "Upload & Preview" button is not rendered
    await expect(page.locator("button", { hasText: "Upload & Preview" })).not.toBeVisible();
  });

  test("Sample download links are visible", async ({ page }) => {
    await page.getByRole("button", { name: "Tally Import" }).click();
    await expect(page.getByRole("link", { name: "Sample XML" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sample Excel" })).toBeVisible();
  });

  test("Import History section is visible", async ({ page }) => {
    await page.getByRole("tab", { name: "History" }).click();
    await expect(page.getByRole("heading", { name: "Import History" })).toBeVisible();
  });

  test("Import History shows empty state or job list", async ({ page }) => {
    await page.getByRole("tab", { name: "History" }).click();
    const emptyState = page.getByText(/no imports yet/i);
    const hasJobs = await page.locator(".divide-y").isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasJobs || hasEmpty).toBeTruthy();
  });
});
