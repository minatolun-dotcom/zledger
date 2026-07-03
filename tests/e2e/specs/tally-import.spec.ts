import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Tally Import", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/tally-import");
    await page.waitForLoadState("networkidle");
  });

  test("Tally Import page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Tally Import" })).toBeVisible();
  });

  test("Upload section is visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Upload File" })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
  });

  test("Upload & Preview button is disabled without file", async ({ page }) => {
    const btn = page.getByRole("button", { name: "Upload & Preview" });
    await expect(btn).toBeDisabled();
  });

  test("Sample download links are visible", async ({ page }) => {
    await expect(page.getByRole("link", { name: "Sample XML" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sample Excel" })).toBeVisible();
  });

  test("Import History section is visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Import History" })).toBeVisible();
  });

  test("Import History shows empty state or job list", async ({ page }) => {
    const emptyState = page.getByText(/no imports yet/i);
    const hasJobs = await page.locator(".divide-y").isVisible().catch(() => false);
    const hasEmpty = await emptyState.isVisible().catch(() => false);
    expect(hasJobs || hasEmpty).toBeTruthy();
  });
});
