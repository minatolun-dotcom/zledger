import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { selectVoucherType } from "../helpers/interaction";

test.describe("Inline Edit via MasterSelector", () => {
  test("Editing a ledger from the voucher form loads the record", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Vouchers" }).click();
    await selectVoucherType(page, "Payment");
    await page.waitForTimeout(400);

    // Open the From (bank/cash) ledger selector
    const trigger = page.getByRole("button", { name: "Select the bank or cash account", exact: false }).first();
    await trigger.click();
    await page.waitForTimeout(300);

    // Click the inline-edit pencil on the first option
    const pencil = page.locator('span[title="Edit (Ctrl+Enter)"]').first();
    await expect(pencil).toBeVisible();
    await pencil.click();
    await page.waitForTimeout(600);

    // Modal should load, not show the fetch error
    await expect(page.getByText("Failed to load record for editing")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Edit Ledger" })).toBeVisible();
    // The name field should be prefilled (non-empty)
    const nameVal = await page.locator('input[placeholder="Enter name"]').inputValue();
    expect(nameVal.trim().length).toBeGreaterThan(0);
  });
});
