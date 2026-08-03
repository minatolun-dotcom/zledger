import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

test.describe("Parties", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Parties" }).click();
    await page.waitForURL("**/parties");
    await page.waitForLoadState("networkidle");
  });

  test("Create a party via modal", async ({ page }) => {
    const name = `${E2E_PREFIX} Party Co`;
    await page.getByRole("button", { name: "Create Party" }).click();
    await expect(page.getByRole("heading", { name: "Create Party" })).toBeVisible();
    await page.getByPlaceholder("e.g. ABC Traders").fill(name);
    await page.locator(".fixed.inset-0").getByRole("button", { name: "Create Party", exact: true }).click();
    await page.waitForTimeout(800);
    await expect(page.getByText(name).first()).toBeVisible();
  });
});
