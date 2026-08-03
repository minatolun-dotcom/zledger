import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

const E2E_PREFIX = "[E2E]";

test.describe("GST Pages (split)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("HSN / SAC page loads and shows heading", async ({ page }) => {
    await page.goto("/gst?tab=hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "HSN / SAC Codes" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("GST Registrations page loads and shows heading", async ({ page }) => {
    await page.goto("/gst?tab=registrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "GST Registrations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add registration/i })).toBeVisible();
  });

  test("HSN/SAC page has add button", async ({ page }) => {
    await page.goto("/gst?tab=hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /add hsn/i })).toBeVisible();
  });
});

test.describe("HSN/SAC CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst?tab=hsn-sac");
    await page.waitForLoadState("networkidle");
  });

  test("Create and delete an HSN code", async ({ page }) => {
    // Use valid 4-8 digit HSN code (digits only)
    const code = `${Date.now().toString().slice(-8)}`;

    await page.getByRole("button", { name: /Add HSN\/SAC/ }).click();
    await page.getByPlaceholder("e.g. 998314").fill(code);
    await page.getByPlaceholder("e.g. Other IT services").fill(`${E2E_PREFIX} Test HSN Service`);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("cell", { name: code })).toBeVisible();

    const row = page.getByRole("row").filter({ hasText: code });
    await row.getByRole("button", { name: "Delete" }).click();
    
    // Handle the custom confirmation modal - the modal's confirm button has red background
    await expect(page.locator('.fixed.inset-0.z-\\[9999\\] button:has-text("Delete")').first()).toBeVisible({ timeout: 5000 });
    await page.locator('.fixed.inset-0.z-\\[9999\\] button:has-text("Delete")').first().click();
    
    // Wait for the DELETE API response
    const deleteResponse = await page.waitForResponse(
      response => response.url().includes("/gst?tab=hsn-sac/") && response.request().method() === "DELETE"
    ).catch(() => null);
    
    if (deleteResponse) {
      console.log("DELETE response status:", deleteResponse.status());
      const text = await deleteResponse.text().catch(() => "");
      console.log("DELETE response body:", text);
    } else {
      console.log("No DELETE response captured");
    }
    
    // Wait for the API response
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    
    // Check if the row is still there
    const rowCount = await page.getByRole("row").filter({ hasText: code }).count();
    console.log("Row count after delete:", rowCount);
    
    // Wait for the row to be removed from the DOM
    await expect(page.getByRole("row").filter({ hasText: code })).toHaveCount(0, { timeout: 15000 });
  });

  test("HSN form toggles open and closed", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /Add HSN\/SAC/ });
    await addBtn.click();
    await expect(page.getByPlaceholder("e.g. 998314")).toBeVisible();
    // The Cancel button (toggled from Add) is behind the modal overlay, so
    // close via Escape which the component's useEscapeToClose hook handles.
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("e.g. 998314")).toHaveCount(0);
    // Verify the add button returned to its default label
    await expect(addBtn).toHaveText("+ Add HSN/SAC");
  });
});

test.describe("GST Registrations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst?tab=registrations");
    await page.waitForLoadState("networkidle");
  });

  test("Add Registration form opens", async ({ page }) => {
    await page.getByRole("button", { name: /Add Registration/i }).click();
    await expect(page.getByPlaceholder("22AAAAA0000A1Z5")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("Create and delete a GST registration", async ({ page }) => {
    // Valid 15-char GSTIN: 2-digit state + 10-char PAN + 1-char entity + Z + 1-char checksum
    // Format: 22AAAAA0000A1Z5 (example for Maharashtra)
    // PAN = 5 letters + 4 digits + 1 letter = 10 chars
    const panSeq = Date.now().toString().slice(-4).padStart(4, "0");
    const pan = `AAAAA${panSeq}A`; // 5 letters + 4 digits + 1 letter = 10 chars
    const gstin = `27${pan}1Z5`; // 27 + PAN(10) + 1(entity) + Z + 5(checksum) = 15 chars

    await page.getByRole("button", { name: /Add Registration/i }).click();
    await page.getByPlaceholder("22AAAAA0000A1Z5").fill(gstin);
    await page.locator("input").nth(1).fill(`${E2E_PREFIX} Test Reg`);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(gstin)).toBeVisible();

    const card = page.locator(".rounded-xl.border").filter({ hasText: gstin });
    await card.getByRole("button", { name: "Delete" }).click();
    
    // Handle the custom confirmation modal
    await expect(page.locator('.fixed.inset-0').getByRole("button", { name: "Delete" })).toBeVisible({ timeout: 5000 });
    await page.locator('.fixed.inset-0').getByRole("button", { name: "Delete" }).click();
    
    // Wait for the API response
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    
    await expect(page.getByText(gstin)).toHaveCount(0);
  });
});
