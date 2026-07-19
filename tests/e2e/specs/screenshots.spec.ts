import { test, type Page } from "@playwright/test";
import { loginAsAdmin, logout } from "../helpers/login";
import { COMPANY } from "../helpers/fixtures";

const DIR = "screenshots";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    if (t === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("zledger.theme", t);
  }, theme);
}

async function cap(page: Page, name: string, theme: "light" | "dark" = "light") {
  await setTheme(page, theme);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
}

async function nav(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
}

test.describe("Visual Audit — Full Page Capture", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("01 Login page", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await setTheme(page, "light");
    await page.goto("/login");
    await page.waitForURL("**/login");
    await page.waitForTimeout(300);
    await cap(page, "01-login", "light");
    await setTheme(page, "dark");
    await cap(page, "01-login", "dark");
  });

  test("02 Company select page", async ({ page }) => {
    // Clear saved company selection so the page shows
    await page.evaluate(() => localStorage.removeItem("zledger.activeCompanyId"));
    await page.goto("/companies");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await cap(page, "02-company-select", "light");
    await setTheme(page, "dark");
    await cap(page, "02-company-select", "dark");
  });

  test("03 Dashboard", async ({ page }) => {
    await nav(page, "/");
    await cap(page, "03-dashboard", "light");
    await cap(page, "03-dashboard", "dark");
  });

  test("04 Dashboard — sidebar expanded", async ({ page }) => {
    await nav(page, "/");
    // Expand all sidebar groups
    const groups = page.locator("nav button").filter({ has: page.locator("svg.feather-chevron-down, svg.lucide-chevron-down") });
    const count = await groups.count();
    for (let i = 0; i < count; i++) {
      await groups.nth(i).click();
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(300);
    await cap(page, "04-dashboard-sidebar-expanded", "light");
    await cap(page, "04-dashboard-sidebar-expanded", "dark");
  });

  test("05 Dashboard — search modal open", async ({ page }) => {
    await nav(page, "/");
    await page.keyboard.press("/");
    await page.waitForTimeout(300);
    await cap(page, "05-search-modal", "light");
    await cap(page, "05-search-modal", "dark");
    await page.keyboard.press("Escape");
  });

  test("06 Dashboard — profile dropdown open", async ({ page }) => {
    await nav(page, "/");
    const profileBtn = page.locator("button").filter({ hasText: "Administrator" });
    if (await profileBtn.isVisible()) await profileBtn.click();
    await page.waitForTimeout(200);
    await cap(page, "06-profile-dropdown", "light");
    await cap(page, "06-profile-dropdown", "dark");
    await page.keyboard.press("Escape");
  });

  test("07 Chart of Accounts", async ({ page }) => {
    await nav(page, "/chart-of-accounts");
    await cap(page, "07-coa", "light");
    await cap(page, "07-coa", "dark");
  });

  test("08 Vouchers page", async ({ page }) => {
    await nav(page, "/vouchers");
    await page.waitForTimeout(500);
    await cap(page, "08-vouchers", "light");
    await cap(page, "08-vouchers", "dark");
  });

  test("09 DayBook", async ({ page }) => {
    await nav(page, "/daybook");
    await page.waitForTimeout(500);
    await cap(page, "09-daybook", "light");
    await cap(page, "09-daybook", "dark");
  });

  test("10 Reports — Trial Balance", async ({ page }) => {
    await nav(page, "/reports");
    await page.waitForTimeout(500);
    await cap(page, "10-reports", "light");
    await cap(page, "10-reports", "dark");
  });

  test("11 Compliance", async ({ page }) => {
    await nav(page, "/compliance");
    await page.waitForTimeout(500);
    await cap(page, "11-compliance", "light");
    await cap(page, "11-compliance", "dark");
  });

  test("12 Inventory", async ({ page }) => {
    await nav(page, "/inventory");
    await page.waitForTimeout(500);
    await cap(page, "12-inventory", "light");
    await cap(page, "12-inventory", "dark");
  });

  test("13 GST Settings (HSN/SAC)", async ({ page }) => {
    await nav(page, "/gst");
    await page.waitForTimeout(500);
    await cap(page, "13-gst-settings", "light");
    await cap(page, "13-gst-settings", "dark");
  });

  test("14 E-Invoice", async ({ page }) => {
    await nav(page, "/einvoice");
    await page.waitForTimeout(500);
    await cap(page, "14-einvoice", "light");
    await cap(page, "14-einvoice", "dark");
  });

  test("15 E-Way Bill", async ({ page }) => {
    await nav(page, "/eway-bill");
    await page.waitForTimeout(500);
    await cap(page, "15-ewaybill", "light");
    await cap(page, "15-ewaybill", "dark");
  });

  test("16 TDS/TCS", async ({ page }) => {
    await nav(page, "/tds-tcs");
    await page.waitForTimeout(500);
    await cap(page, "16-tds-tcs", "light");
    await cap(page, "16-tds-tcs", "dark");
  });

  test("17 Bank Reconciliation", async ({ page }) => {
    await nav(page, "/bank-reconciliation");
    await page.waitForTimeout(500);
    await cap(page, "17-bank-rec", "light");
    await cap(page, "17-bank-rec", "dark");
  });

  test("18 Company Settings", async ({ page }) => {
    await nav(page, "/company-settings");
    await page.waitForTimeout(500);
    await cap(page, "18-company-settings", "light");
    await cap(page, "18-company-settings", "dark");
  });

  test("19 Financial Years", async ({ page }) => {
    await nav(page, "/company-settings?tab=financial-years");
    await page.waitForTimeout(500);
    await cap(page, "19-financial-years", "light");
    await cap(page, "19-financial-years", "dark");
  });

  test("20 Tally Import", async ({ page }) => {
    await nav(page, "/tally-import");
    await page.waitForTimeout(500);
    await cap(page, "20-tally-import", "light");
    await cap(page, "20-tally-import", "dark");
  });

  test("21 Profile page", async ({ page }) => {
    await nav(page, "/profile");
    await page.waitForTimeout(500);
    await cap(page, "21-profile", "light");
    await cap(page, "21-profile", "dark");
  });

  test("22 Members", async ({ page }) => {
    await nav(page, "/members");
    await page.waitForTimeout(500);
    await cap(page, "22-members", "light");
    await cap(page, "22-members", "dark");
  });

  test("23 Audit Log", async ({ page }) => {
    await nav(page, "/audit");
    await page.waitForTimeout(500);
    await cap(page, "23-audit-log", "light");
    await cap(page, "23-audit-log", "dark");
  });

  test("24 Admin Users", async ({ page }) => {
    await nav(page, "/admin/users");
    await page.waitForTimeout(500);
    await cap(page, "24-admin-users", "light");
    await cap(page, "24-admin-users", "dark");
  });

  test("25 Admin Companies", async ({ page }) => {
    await nav(page, "/admin/companies");
    await page.waitForTimeout(500);
    await cap(page, "25-admin-companies", "light");
    await cap(page, "25-admin-companies", "dark");
  });

  test("26 Voucher modal (Sales)", async ({ page }) => {
    await nav(page, "/vouchers");
    // Click the first voucher row to open modal
    const row = page.locator("table tbody tr").first();
    if (await row.isVisible()) {
      await row.click();
      await page.waitForTimeout(500);
      await cap(page, "26-voucher-modal", "light");
      await cap(page, "26-voucher-modal", "dark");
      await page.keyboard.press("Escape");
    }
  });
});
