import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { ADMIN } from "../helpers/fixtures";

const nav = (page: any) => page.locator("nav");
const sidebarLink = (page: any, name: string) =>
  nav(page).getByRole("link", { name, exact: true });

test.describe("Sidebar Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  async function toggleGroup(page: any, groupName: string) {
    const btn = nav(page).getByRole("button").filter({ hasText: groupName });
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  test("all 5 module groups are visible", async ({ page }) => {
    const groups = ["Accounting", "Inventory", "GST & Tax", "Reports", "Company"];
    for (const g of groups) {
      await expect(nav(page).getByText(g, { exact: true })).toBeVisible();
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
    await expect(nav(page).getByText("GST", { exact: true })).toBeVisible();
    await expect(sidebarLink(page, "TDS / TCS")).toBeVisible();
  });

  test("expand GST subgroup shows all GST pages", async ({ page }) => {
    await toggleGroup(page, "GST & Tax");
    await nav(page).getByText("GST", { exact: true }).click();
    await page.waitForTimeout(300);
    await expect(sidebarLink(page, "GST Compliance")).toBeVisible();
    await expect(sidebarLink(page, "E-Invoice")).toBeVisible();
    await expect(sidebarLink(page, "E-Way Bill")).toBeVisible();
    await expect(sidebarLink(page, "HSN / SAC")).toBeVisible();
    await expect(sidebarLink(page, "GST Registrations")).toBeVisible();
  });

  test("expand Reports group shows items", async ({ page }) => {
    await toggleGroup(page, "Reports");
    await expect(sidebarLink(page, "Day Book")).toBeVisible();
    await expect(sidebarLink(page, "Financial Reports")).toBeVisible();
  });

  test("expand Company group shows items", async ({ page }) => {
    await toggleGroup(page, "Company");
    await expect(sidebarLink(page, "Company Settings")).toBeVisible();
    await expect(sidebarLink(page, "Financial Years")).toBeVisible();
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
    await page.getByRole("button", { name: "Zledger", exact: true }).click();
    await page.waitForURL("/");
  });

  test.describe("Global Search (Ctrl+K)", () => {
    test("opens search modal with / key", async ({ page }) => {
      await page.keyboard.press("/");
      await expect(page.getByPlaceholder("Search pages...")).toBeVisible();
    });

    test("search finds pages", async ({ page }) => {
      await page.keyboard.press("/");
      await page.getByPlaceholder("Search pages...").fill("voucher");
      await expect(page.getByRole("button", { name: /Vouchers/ })).toBeVisible();
    });

    test("search result navigates to page", async ({ page }) => {
      await page.keyboard.press("/");
      await page.getByPlaceholder("Search pages...").fill("chart of");
      await page.getByRole("button", { name: /Chart of Accounts/ }).click();
      await page.waitForURL("**/chart-of-accounts");
    });

    test("escape closes search", async ({ page }) => {
      await page.keyboard.press("/");
      await expect(page.getByPlaceholder("Search pages...")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByPlaceholder("Search pages...")).not.toBeVisible();
    });
  });

  test.describe("Profile Dropdown", () => {
    test("profile dropdown opens with sections", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name, exact: false }).click();
      await expect(page.getByText("My Profile")).toBeVisible();
      await expect(page.getByText("Members")).toBeVisible();
      await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
      await expect(page.getByText("Audit Log")).toBeVisible();
      await expect(page.getByText("Sign Out")).toBeVisible();
    });

    test("profile dropdown has appearance selector", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name, exact: false }).click();
      await expect(page.getByRole("button", { name: "Light" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Dark" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Auto" })).toBeVisible();
    });

    test("appearance mode switches theme", async ({ page }) => {
      await page.getByRole("button", { name: ADMIN.name, exact: false }).click();
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByRole("button", { name: "Light" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });
  });
});
