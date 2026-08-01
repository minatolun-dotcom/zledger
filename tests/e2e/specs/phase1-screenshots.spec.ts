import { test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

const DIR = "screenshots/phase1";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    if (t === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("zledger.theme", t);
  }, theme);
}

async function cap(page: Page, name: string, theme: "light" | "dark" = "light") {
  await setTheme(page, theme);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}-${theme}.png`, fullPage: true });
}

test.describe("Phase 1 Audit — Bill-wise Accounting & Outstanding Management", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("BI dashboard renders KPI cards, insights and charts", async ({ page }) => {
    await page.goto("/reports/business-intelligence");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);
    await page.getByText(/Business Intelligence/i).first().waitFor({ state: "visible" });
    await cap(page, "business-intelligence", "light");
    await cap(page, "business-intelligence", "dark");
  });

  test("Voucher browse shows bill-wise voucher entries", async ({ page }) => {
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await cap(page, "vouchers-browse", "light");
    await cap(page, "vouchers-browse", "dark");
  });

  test("Reports Aging tab shows outstanding buckets", async ({ page }) => {
    await page.goto("/reports?tab=aging");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.getByText("Aging", { exact: true }).first().waitFor({ state: "visible" });
    await cap(page, "reports-aging", "light");
    await cap(page, "reports-aging", "dark");
  });

  test("Reports Outstanding tab shows party-wise outstanding", async ({ page }) => {
    await page.goto("/reports?tab=outstanding");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.getByText("Outstanding", { exact: true }).first().waitFor({ state: "visible" });
    await cap(page, "reports-outstanding", "light");
    await cap(page, "reports-outstanding", "dark");
  });

  test("Standalone bill-wise Aging Analysis page", async ({ page }) => {
    await page.goto("/reports/aging-analysis");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.getByText("Aging Analysis", { exact: true }).first().waitFor({ state: "visible" });
    await cap(page, "aging-analysis", "light");
    await cap(page, "aging-analysis", "dark");
  });

  test("Standalone Outstanding Bills by Party page", async ({ page }) => {
    await page.goto("/reports/outstanding-bills");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    await page.getByText("Outstanding Bills Report", { exact: true }).first().waitFor({ state: "visible" });
    await cap(page, "outstanding-bills", "light");
    await cap(page, "outstanding-bills", "dark");
  });
});
