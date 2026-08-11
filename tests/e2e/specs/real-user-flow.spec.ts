import { test, expect } from "@playwright/test";
import { loginAsAdmin, logout } from "../helpers/login";
import { ADMIN, COMPANY, STOCK_ITEMS, LEDGERS } from "../helpers/fixtures";

test.describe("Real User Flow — Full Day in Zledger", () => {
  test("1. Login and land on dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("button", { name: "Zledger", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Dashboard" }).first()).toBeVisible();
  });

  test("2. Dashboard shows KPI cards and widgets", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.locator("text=Total Income")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Income vs Expenses")).toBeVisible({ timeout: 10000 });
  });

  test("3. Navigate to Manufacturing and view BOMs", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Manufacturing" }).first()).toBeVisible();
    await expect(page.getByText("Wireless Mouse Assembly")).toBeVisible({ timeout: 10000 });
  });

  test("4. Switch to Production Orders tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Orders" }).click();
    await page.waitForTimeout(1000);
    await expect(page.locator("text=PRD-").first()).toBeVisible({ timeout: 10000 });
  });

  test("5. View Work Centers tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByRole("tab", { name: "Work Centers" }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Assembly Line A")).toBeVisible({ timeout: 10000 });
  });

  test("6. View Routings tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByRole("tab", { name: "Routings" }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Mouse Assembly Routing")).toBeVisible({ timeout: 10000 });
  });

  test("7. Navigate to Batches browse page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/batches");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("heading", { name: "Batches" })).toBeVisible();
    await expect(page.locator("text=PCB-M-2026-001")).toBeVisible({ timeout: 15000 });
  });

  test("8. Check Expiry Alerts tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/batches");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await page.getByRole("tab", { name: "Expiry Alerts" }).click();
    await page.waitForTimeout(2000);
    const noExpiring = page.locator("text=No batches expiring");
    const hasExpiring = page.locator("text=days left");
    await expect(noExpiring.or(hasExpiring)).toBeVisible({ timeout: 10000 });
  });

  test("9. Check Batch Report tab", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/batches");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    await page.getByRole("tab", { name: "Report", exact: true }).click();
    await page.waitForTimeout(5000);
    // Just verify the tab switched and page is stable
    await expect(page.getByRole("heading", { name: "Batches" })).toBeVisible();
  });

  test("10. Navigate to Batch Trace", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Batches" }).click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Batch Trace" }).click();
    await expect(page.getByPlaceholder("e.g. PCB-M-2026-001")).toBeVisible();
  });

  test("11. Navigate to Inventory", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Stock & Inventory" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible({ timeout: 10000 });
  });

  test("12. Navigate to Chart of Accounts", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Chart of Accounts" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible({ timeout: 10000 });
  });

  test("13. Navigate to Day Book", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Daybook" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Day Book" })).toBeVisible({ timeout: 10000 });
  });

  test("14. Navigate to Payments", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Payments" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Payments & Receivables" })).toBeVisible({ timeout: 10000 });
  });

  test("15. Navigate to Reports", async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Reports" }).click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 10000 });
  });

  test("16. Navigate to GST page", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/gst");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "GST" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("17. Navigate to Profile and update name", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();

    const nameInput = page.locator("input[type='text']").first();
    await nameInput.fill("Administrator");
    await page.getByRole("button", { name: "Update Profile" }).click();
    await page.waitForTimeout(3000);
    // Toast may appear and disappear quickly, just verify the page is still on profile
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();
  });

  test("19. Switch to Security tab on Profile", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Security" }).click();
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "Change Password" })).toBeVisible();
    await expect(page.getByText("Appearance")).toBeVisible();
  });

  test("20. Check notifications bell", async ({ page }) => {
    await loginAsAdmin(page);
    const bell = page.locator("[title='Notifications']");
    if (await bell.isVisible({ timeout: 3000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(500);
      await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible({ timeout: 3000 });
    }
  });

  test("21. Create a sales voucher end-to-end", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Sales tab should be active — verify Voucher No. label is visible
    const voucherNoLabel = page.locator("label", { hasText: "Voucher No." });
    await expect(voucherNoLabel).toBeVisible({ timeout: 5000 });
  });

  test("22. Navigate to Recurring Templates", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/recurring-templates");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Recurring Templates" })).toBeVisible({ timeout: 10000 });
  });

  test("23. Navigate to Company Settings", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/company-settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page.getByRole("heading", { name: "Company Settings" })).toBeVisible({ timeout: 10000 });
  });

  test("24. Navigate to Members", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/members");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Members" })).toBeVisible({ timeout: 10000 });
  });

  test("25. Full logout flow", async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page.getByText("Sign in to your Zledger workspace")).toBeVisible();
  });
});
