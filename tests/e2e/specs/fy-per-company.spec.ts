import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

// Regression lock for the round-32/33 localStorage audit: the FY selection
// used to live in a global "zledger.fyId" key. FY ids are unique per company,
// so a global key could hand company A's FY id to company B (wrong period on
// reports and voucher numbering). It is now "zledger.fyId.<companyId>",
// reloaded on company switch. This spec proves each company keeps its own FY.
test.describe("Per-company FY selection", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page); // logs in and enters Apex Enterprises
  });

  test("each company keeps its own FY when switching back and forth", async ({ page }) => {
    // Wait for the FY auto-select on the Apex dashboard.
    await page.waitForSelector("text=FY", { timeout: 20000 });
    const apexId = await page.evaluate(() => localStorage.getItem("zledger.company"));
    expect(apexId).toBeTruthy();
    const apexFyKey = `zledger.fyId.${apexId}`;
    const apexFy = await page.evaluate((k) => localStorage.getItem(k), apexFyKey);
    expect(apexFy, "Apex should have a persisted FY under its scoped key").toBeTruthy();
    expect(
      await page.evaluate(() => localStorage.getItem("zledger.fyId")),
      "no legacy unscoped zledger.fyId key may be written"
    ).toBeNull();

    // Create a new company through the picker UI.
    const coName = `Test Co FY E2E ${Date.now()}`;
    await page.goto("/companies");
    await page.getByText("+ Create new company", { exact: false }).first().click();
    await page.waitForSelector("text=New Company");
    const nameInput = page.locator("input[required]").first();
    await nameInput.fill(coName);
    await page.locator('input[placeholder="dd/mm/yyyy"]').first().fill("01/04/2025");
    await nameInput.press("Enter"); // native submit

    // Enter the newly created company.
    await page.getByText(coName, { exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.waitForSelector("text=FY", { timeout: 20000 });

    // The new company has its OWN FY id — different from Apex's, stored under
    // its own scoped key. Apex's key must be untouched.
    const newCoId = await page.evaluate(() => localStorage.getItem("zledger.company"));
    expect(newCoId).not.toBe(apexId);
    const newCoFyKey = `zledger.fyId.${newCoId}`;
    const newCoFy = await page.evaluate((k) => localStorage.getItem(k), newCoFyKey);
    expect(newCoFy, "new company should auto-select its own FY").toBeTruthy();
    expect(newCoFy).not.toBe(apexFy);
    expect(await page.evaluate((k) => localStorage.getItem(k), apexFyKey)).toBe(apexFy);

    // Switch back to Apex — its FY selection is restored.
    await page.goto("/companies");
    await page.getByText("Apex Enterprises", { exact: true }).first().click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.waitForSelector("text=FY", { timeout: 20000 });
    expect(await page.evaluate((k) => localStorage.getItem(k), apexFyKey)).toBe(apexFy);

    // And back to the new company — its own FY is still selected.
    await page.goto("/companies");
    await page.getByText(coName, { exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });
    await page.waitForSelector("text=FY", { timeout: 20000 });
    expect(await page.evaluate((k) => localStorage.getItem(k), newCoFyKey)).toBe(newCoFy);
  });
});
