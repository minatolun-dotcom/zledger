import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ensureLogoUploaded = async (page: any) => {
  // Remove existing logo if present
  const removeBtn = page.getByRole("button", { name: "Remove Logo" });
  if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await removeBtn.click();
    await page.waitForTimeout(1000);
  }

  // Upload logo
  const fileChooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Upload Logo" }).click();
  const fileChooser = await fileChooserPromise;
  const testPng = path.join(__dirname, "../fixtures/test-logo.png");
  await fileChooser.setFiles(testPng);
  await page.waitForTimeout(2000);
  await expect(page.getByRole("button", { name: "Change Logo" })).toBeVisible({ timeout: 5000 });
};

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

  test("Logo appears in sidebar company card after upload", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await ensureLogoUploaded(page);

    // Navigate to dashboard and check sidebar card
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Sidebar company card should have an img tag
    const sidebar = page.locator("aside");
    const companyCardImg = sidebar.locator("img").first();
    await expect(companyCardImg).toBeVisible();
    await expect(companyCardImg).toHaveAttribute("src", /\/api\/companies\//);
  });

  test("Logo appears in dashboard header after upload", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await ensureLogoUploaded(page);

    // Navigate to dashboard
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Dashboard header should have a logo img
    const main = page.locator("main");
    const headerImg = main.locator("img").first();
    await expect(headerImg).toBeVisible();
    await expect(headerImg).toHaveAttribute("src", /\/api\/companies\//);
  });

  test("Logo disappears from sidebar and header after removal", async ({ page }) => {
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Ensure logo exists
    await ensureLogoUploaded(page);

    // Remove it
    await page.getByRole("button", { name: "Remove Logo" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("button", { name: "Upload Logo" })).toBeVisible();

    // Navigate to dashboard
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Sidebar card should not have an img
    const sidebar = page.locator("aside");
    const companyCardImg = sidebar.locator("img").first();
    await expect(companyCardImg).not.toBeVisible();

    // Dashboard header should not have an img
    const main = page.locator("main");
    const headerImg = main.locator("img").first();
    await expect(headerImg).not.toBeVisible();
  });
});
