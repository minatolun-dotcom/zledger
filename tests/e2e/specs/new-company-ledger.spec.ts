import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

// Regression lock for the round-30 bug: after creating a new company, the COA
// page used to serve the previous company's cached groups (React Query keys
// weren't company-scoped, staleTime 5 min) — New Ledger posted a foreign
// group_id and failed with 404 "Group not found". Keys are now scoped by
// company id, so this must succeed.
test.describe("New company → ledger creation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page); // logs in and enters Apex Enterprises
  });

  test("creates a ledger in a freshly created company (no stale-cache 404)", async ({ page }) => {
    // Warm the React Query cache with the previous company's COA data first —
    // this is the state that used to leak across the company switch.
    await page.goto("/chart-of-accounts");
    // Generous timeout: the first page load right after a DB reset can be slow.
    await page.waitForSelector("text=Bank Accounts", { timeout: 20000 });

    // Create a new company through the picker UI
    const coName = `Test Co Ledger E2E ${Date.now()}`;
    await page.goto("/companies");
    await page.getByText("+ Create new company", { exact: false }).first().click();
    await page.waitForSelector("text=New Company");
    const nameInput = page.locator("input[required]").first();
    await nameInput.fill(coName);
    await page.locator('input[placeholder="dd/mm/yyyy"]').first().fill("01/04/2025");
    await nameInput.press("Enter"); // native submit

    // The picker re-lists companies — enter the newly created one.
    await page.getByText(coName, { exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/", { timeout: 20000 });

    // Chart of Accounts in the new company — its own seeded groups render.
    await page.goto("/chart-of-accounts");
    await page.waitForSelector("text=Bank Accounts", { timeout: 20000 });

    // Create a ledger under Bank Accounts — must succeed (201), not "Group not found".
    await page.getByRole("button", { name: "New Ledger" }).click();
    await page.locator('input[placeholder="e.g. Rent Expense"]').fill("Test Co Ledger E2E Bank");
    await page.locator('[data-field="group"] input[role="combobox"]').click();
    await page.locator('[data-field="group"] input[role="combobox"]').fill("Bank");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Create Ledger" }).click();
    await expect(page.getByRole("button", { name: "Create Ledger" })).toBeHidden({ timeout: 10000 });
    await expect(page.getByText("Group not found")).not.toBeVisible();

    // Definitive: the ledger exists in the NEW company's ledger list.
    const found = await page.evaluate(async () => {
      const token = localStorage.getItem("zledger.token");
      const cid = localStorage.getItem("zledger.company");
      const r = await fetch("/api/coa/ledgers", {
        headers: { Authorization: `Bearer ${token}`, "X-Company-Id": cid! },
      });
      const ledgers = await r.json();
      return ledgers.some((l: any) => l.name === "Test Co Ledger E2E Bank");
    });
    expect(found).toBe(true);
  });
});
