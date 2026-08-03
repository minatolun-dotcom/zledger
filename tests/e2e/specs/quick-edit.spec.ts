import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectVoucherType } from "../helpers/interaction";

test.describe("Inline Edit via MasterSelector", () => {
  test("Editing a ledger from the voucher form loads the record", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await selectVoucherType(page, "Payment");
    await page.waitForTimeout(400);

    // Open the Paid From (cash/bank) ledger selector — a MasterSelector combobox
    const combo = page.getByPlaceholder("Select cash / bank account...").first();
    await combo.click();
    await page.waitForTimeout(300);
    await combo.fill("HDFC");
    await page.waitForTimeout(400);

    // Ctrl+Enter on the highlighted (first) option opens the inline edit modal
    await page.keyboard.press("Control+Enter");
    await page.waitForTimeout(600);

    // Modal should load, not show the fetch error
    await expect(page.getByText("Failed to load record for editing")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Edit Ledger" })).toBeVisible();
    // The name field should be prefilled (non-empty)
    const nameVal = await page.locator('input[placeholder="Enter name"]').inputValue();
    expect(nameVal.trim().length).toBeGreaterThan(0);
  });
});
