import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("GSTR Annual Returns status (GSTR-9)", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("GST Status lists GSTR-9 (Annual) return", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "GST Status" }).click();
    await page.waitForTimeout(800);
    // The annual GSTR-9 return is part of the filing-status summary.
    await expect(page.getByText(/GSTR-9 \(Annual\)/i)).toBeVisible();
  });

  test("GST Status lists monthly and annual returns without JS errors", async ({ page }) => {
    await page.goto("/compliance");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "GST Status" }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(/GSTR-1 \(Outward\)/i)).toBeVisible();
    await expect(page.getByText(/GSTR-3B \(Monthly\)/i)).toBeVisible();
    await expect(page.getByText(/GSTR-9 \(Annual\)/i)).toBeVisible();

    const errors = (page as any).__errors || [];
    const realErrors = errors.filter(
      (e: string) => !/ERR_NETWORK_CHANGED|Failed to load resource/i.test(e)
    );
    if (realErrors.length > 0) {
      throw new Error(`JS errors on GST status: ${realErrors.join(" | ")}`);
    }
  });
});
