import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { ADMIN } from "../helpers/fixtures";

const nav = (page: any) => page.locator("nav");
const sidebarLink = (page: any, name: string) =>
  nav(page).getByRole("link", { name, exact: true });

// The sidebar is collapsed by default; expand it so group labels + links show.
async function expandSidebar(page: any) {
  const expandToggle = page.getByTitle("Expand sidebar");
  if (await expandToggle.isVisible().catch(() => false)) {
    await expandToggle.click();
    await page.waitForTimeout(400);
  }
}

test.describe("Sidebar Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await expandSidebar(page);
  });

  async function toggleGroup(page: any, groupName: string) {
    const btn = nav(page).getByRole("button", { name: groupName, exact: true });
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  test("all 5 module groups are visible", async ({ page }) => {
    const groups = ["Accounting", "Inventory", "GST & Tax", "Reports", "Settings"];
    for (const g of groups) {
      await expect(nav(page).getByRole("button", { name: g, exact: true })).toBeVisible();
    }
  });

  test("expand Accounting group shows items", async ({ page }) => {
    await toggleGroup(page, "Accounting");
    await expect(sidebarLink(page, "Chart of Accounts")).toBeVisible();
    await expect(sidebarLink(page, "Vouchers")).toBeVisible();
    await expect(sidebarLink(page, "Reconciliation")).toBeVisible();
  });

  test("expand Inventory group shows item", async ({ page }) => {
    await toggleGroup(page, "Inventory");
    await expect(sidebarLink(page, "Stock & Inventory")).toBeVisible();
  });

  test("expand GST & Tax group shows subgroup + items", async ({ page }) => {
    await toggleGroup(page, "GST & Tax");
    await expect(sidebarLink(page, "GST")).toBeVisible();
    await expect(sidebarLink(page, "TDS / TCS")).toBeVisible();
  });

  test("expand GST subgroup shows all GST pages", async ({ page }) => {
    await toggleGroup(page, "GST & Tax");
    await expect(sidebarLink(page, "GST")).toBeVisible();
    await expect(sidebarLink(page, "TDS / TCS")).toBeVisible();
    await sidebarLink(page, "GST").click();
    await page.waitForURL("**/gst");
    await expect(page.getByText("E-Invoice")).toBeVisible();
    await expect(page.getByText("E-Way Bill")).toBeVisible();
    await expect(page.getByText("HSN / SAC")).toBeVisible();
  });

  test("expand Reports group shows items", async ({ page }) => {
    await toggleGroup(page, "Reports");
    await expect(sidebarLink(page, "Day Book")).toBeVisible();
    await expect(sidebarLink(page, "Financial Reports")).toBeVisible();
  });

  test("expand Settings group shows items", async ({ page }) => {
    await toggleGroup(page, "Settings");
    await expect(sidebarLink(page, "Company Settings")).toBeVisible();
    await expect(sidebarLink(page, "Import / Export")).toBeVisible();
  });

  test("clicking a nav item navigates to the page", async ({ page }) => {
    await toggleGroup(page, "Accounting");
    await sidebarLink(page, "Chart of Accounts").click();
    await page.waitForURL("**/chart-of-accounts");
  });

  test("brand logo navigates to dashboard", async ({ page }) => {
    await toggleGroup(page, "Reports");
    await sidebarLink(page, "Day Book").click();
    await page.waitForURL("**/daybook");
    await page.locator("header").getByRole("button", { name: "Zledger", exact: true }).click();
    await page.waitForURL("/");
  });

  test("brand logo appears in header alongside search", async ({ page }) => {
    const header = page.locator("header");
    const brand = header.getByRole("button", { name: "Zledger", exact: true });
    const searchBtn = header.getByRole("button", { name: /Search/ });
    await expect(brand).toBeVisible();
    await expect(searchBtn).toBeVisible();
  });

  test.describe("Global Search (Ctrl+K)", () => {
    test("opens search modal with / key", async ({ page }) => {
      await page.keyboard.press("/");
      await expect(page.getByPlaceholder("Search pages and actions...")).toBeVisible();
    });

    test("search finds pages", async ({ page }) => {
      await page.keyboard.press("/");
      await page.getByPlaceholder("Search pages and actions...").fill("voucher");
      await expect(page.locator('[data-search-item="true"]', { hasText: /Vouchers/ })).toBeVisible();
    });

    test("search result navigates to page", async ({ page }) => {
      await page.keyboard.press("/");
      await page.getByPlaceholder("Search pages and actions...").fill("chart of");
      await page.getByRole("button", { name: /Chart of Accounts/ }).click();
      await page.waitForURL("**/chart-of-accounts");
    });

    test("escape closes search", async ({ page }) => {
      await page.keyboard.press("/");
      await expect(page.getByPlaceholder("Search pages and actions...")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByPlaceholder("Search pages and actions...")).not.toBeVisible();
    });
  });

  test.describe("Profile Dropdown", () => {
    test("profile dropdown opens with sections", async ({ page }) => {
      await page.locator("button.rounded-full").first().click();
      await expect(page.getByText("My Profile")).toBeVisible();
      await expect(page.getByText("Members")).toBeVisible();
      await expect(page.getByText("Audit Log")).toBeVisible();
      await expect(page.getByText("Sign Out")).toBeVisible();
    });

    test("profile dropdown has appearance selector", async ({ page }) => {
      await page.locator("button.rounded-full").first().click();
      await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
    });

    test("appearance mode switches theme", async ({ page }) => {
      await page.locator("button.rounded-full").first().click();
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByRole("button", { name: "Light" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });
  });
});
