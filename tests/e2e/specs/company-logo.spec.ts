import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe("Company Logo Upload", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Company Settings page shows logo section", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.getByText("Company Logo")).toBeVisible();
    await expect(page.getByText("PNG or JPG, max 2 MB")).toBeVisible();
    // Either Upload or Change button should be visible
    const uploadOrChange = page.getByRole("button", { name: /Upload Logo|Change Logo/ });
    await expect(uploadOrChange).toBeVisible();
  });

  test("Upload logo and verify it appears", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Remove existing logo if present to start clean
    const removeBtn = page.getByRole("button", { name: "Remove Logo" });
    if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(1000);
    }

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Upload Logo" }).click();
    const fileChooser = await fileChooserPromise;

    const testPng = path.join(__dirname, "../fixtures/test-logo.png");
    await fileChooser.setFiles(testPng);

    await page.waitForTimeout(2000);

    await expect(page.getByRole("button", { name: "Change Logo" })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Remove Logo" })).toBeVisible();
    await expect(page.getByText("Logo uploaded")).toBeVisible();
  });

  test("Remove logo after upload", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Ensure a logo exists — upload if needed
    const changeBtn = page.getByRole("button", { name: "Change Logo" });
    if (!(await changeBtn.isVisible({ timeout: 2000 }).catch(() => false))) {
      const fileChooserPromise = page.waitForEvent("filechooser");
      await page.getByRole("button", { name: "Upload Logo" }).click();
      const fileChooser = await fileChooserPromise;
      const testPng = path.join(__dirname, "../fixtures/test-logo.png");
      await fileChooser.setFiles(testPng);
      await page.waitForTimeout(2000);
      await expect(page.getByRole("button", { name: "Remove Logo" })).toBeVisible({ timeout: 5000 });
    }

    // Now remove it
    await page.getByRole("button", { name: "Remove Logo" }).click();
    await page.waitForTimeout(1000);

    await expect(page.getByRole("button", { name: "Upload Logo" })).toBeVisible();
    await expect(page.getByText("Logo removed")).toBeVisible();
  });
});
