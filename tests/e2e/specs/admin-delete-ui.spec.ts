import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9091/api";

test.describe("Admin: Delete Company via UI", () => {
  test("Deactivate and delete a company from the browser", async ({ page }) => {
    const uniqueName = `[E2E-DELETE] ${Date.now()}`;

    await loginAsAdmin(page);
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");

    // Create a test company
    await page.getByRole("button", { name: "+ New Company" }).first().click();
    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill(uniqueName);
    await page.getByRole("button", { name: "Create Company" }).click();
    await page.waitForLoadState("networkidle");

    // Find the test company row (use .first() to handle duplicates)
    const testRow = page.locator("tr", { hasText: uniqueName }).first();
    await expect(testRow).toBeVisible({ timeout: 5000 });

    // Deactivate it
    const deactivateBtn = testRow.locator("button[title='Deactivate']");
    if (await deactivateBtn.isVisible()) {
      await deactivateBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Now delete it
    const deleteBtn = testRow.locator("button[title='Delete']");
    await deleteBtn.click();

    // Confirm dialog — click the Delete button inside the modal overlay
    const confirmBtn = page.locator(".fixed.inset-0 button", { hasText: "Delete" });
    await confirmBtn.click();
    await page.waitForLoadState("networkidle");

    // Verify the company is gone
    await expect(page.locator("tr", { hasText: uniqueName })).not.toBeVisible({ timeout: 5000 });
  });

  test("Delete button sends ?force=true to API", async ({ page }) => {
    const uniqueName = `[E2E-FORCE] ${Date.now()}`;
    let deleteUrl = "";

    page.on("request", (req) => {
      if (req.method() === "DELETE" && req.url().includes("/admin/companies/")) {
        deleteUrl = req.url();
      }
    });

    await loginAsAdmin(page);
    await page.goto("/admin/companies");
    await page.waitForLoadState("networkidle");

    // Create a test company
    await page.getByRole("button", { name: "+ New Company" }).first().click();
    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill(uniqueName);
    await page.getByRole("button", { name: "Create Company" }).click();
    await page.waitForLoadState("networkidle");

    // Find and deactivate
    const testRow = page.locator("tr", { hasText: uniqueName }).first();
    await expect(testRow).toBeVisible({ timeout: 5000 });
    const deactivateBtn = testRow.locator("button[title='Deactivate']");
    if (await deactivateBtn.isVisible()) {
      await deactivateBtn.click();
      await page.waitForLoadState("networkidle");
    }

    // Delete
    const deleteBtn = testRow.locator("button[title='Delete']");
    await deleteBtn.click();
    // Confirm dialog
    const confirmBtn = page.locator(".fixed.inset-0 button", { hasText: "Delete" });
    await confirmBtn.click();
    await page.waitForLoadState("networkidle");

    // Verify ?force=true was sent
    expect(deleteUrl).toContain("force=true");
  });
});
