import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("E-Invoice page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/einvoice");
    await page.waitForLoadState("networkidle");
  });

  test("E-Invoice page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /E-Invoice/ })).toBeVisible();
  });

  test("E-Invoice page has create button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Create E-Invoice/ })).toBeVisible();
  });

  test("E-Invoice page shows voucher list or empty state", async ({ page }) => {
    const table = page.locator("table");
    const emptyState = page.getByText(/no.*e-invoice/i);
    const hasContent = await table.isVisible().catch(() => false) || await emptyState.isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test("E-Invoice create form toggles", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Create E-Invoice/ });
    await btn.click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: /Create E-Invoice/ })).toBeVisible();
  });
});

test.describe("E-Way Bill page", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/eway-bill");
    await page.waitForLoadState("networkidle");
  });

  test("E-Way Bill page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /E-Way Bill/ })).toBeVisible();
  });

  test("E-Way Bill page has create button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Create E-Way Bill/ })).toBeVisible();
  });

  test("E-Way Bill page shows list or empty state", async ({ page }) => {
    const table = page.locator("table");
    const emptyState = page.getByText(/no.*e-way/i);
    const hasContent = await table.isVisible().catch(() => false) || await emptyState.isVisible().catch(() => false);
    expect(hasContent).toBeTruthy();
  });

  test("E-Way Bill create form toggles", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Create E-Way Bill/ });
    await btn.click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: /Create E-Way Bill/ })).toBeVisible();
  });
});
