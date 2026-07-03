import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

const E2E_PREFIX = "[E2E]";

test.describe("GST Pages (split)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("HSN / SAC page loads and shows heading", async ({ page }) => {
    await page.goto("/gst/hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "HSN / SAC Codes" })).toBeVisible();
    await expect(page.locator("table")).toBeVisible();
  });

  test("GST Registrations page loads and shows heading", async ({ page }) => {
    await page.goto("/gst/registrations");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "GST Registrations" })).toBeVisible();
    await expect(page.getByRole("button", { name: /add registration/i })).toBeVisible();
  });

  test("HSN/SAC page has add button", async ({ page }) => {
    await page.goto("/gst/hsn-sac");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /add hsn/i })).toBeVisible();
  });
});

test.describe("HSN/SAC CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst/hsn-sac");
    await page.waitForLoadState("networkidle");
  });

  test("Create and delete an HSN code", async ({ page }) => {
    const code = `${E2E_PREFIX}${Date.now().toString().slice(-8)}`;

    await page.getByRole("button", { name: /Add HSN\/SAC/ }).click();
    await page.getByPlaceholder("e.g. 998314").fill(code);
    await page.getByPlaceholder("e.g. Other IT services").fill(`${E2E_PREFIX} Test HSN Service`);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("cell", { name: code })).toBeVisible();

    page.on("dialog", (d) => d.accept());
    const row = page.getByRole("row").filter({ hasText: code });
    await row.getByRole("button", { name: "Delete" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("cell", { name: code })).toHaveCount(0);
  });

  test("HSN form toggles open and closed", async ({ page }) => {
    const addBtn = page.getByRole("button", { name: /Add HSN\/SAC/ });
    await addBtn.click();
    await expect(page.getByPlaceholder("e.g. 998314")).toBeVisible();
    const cancelBtn = page.getByRole("button", { name: "Cancel" });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();
    await expect(page.getByPlaceholder("e.g. 998314")).toHaveCount(0);
  });
});

test.describe("GST Registrations", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst/registrations");
    await page.waitForLoadState("networkidle");
  });

  test("Add Registration form opens", async ({ page }) => {
    await page.getByRole("button", { name: /Add Registration/i }).click();
    await expect(page.getByPlaceholder("22AAAAA0000A1Z5")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("Create and delete a GST registration", async ({ page }) => {
    const gstin = `27${Date.now().toString().slice(0, 13).padEnd(13, "0")}A1Z5`.slice(0, 15);

    await page.getByRole("button", { name: /Add Registration/i }).click();
    await page.getByPlaceholder("22AAAAA0000A1Z5").fill(gstin);
    await page.locator("input").nth(1).fill(`${E2E_PREFIX} Test Reg`);
    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(gstin)).toBeVisible();

    page.on("dialog", (d) => d.accept());
    const card = page.locator(".rounded-lg.border").filter({ hasText: gstin });
    await card.getByRole("button", { name: "Delete" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(gstin)).toHaveCount(0);
  });
});
