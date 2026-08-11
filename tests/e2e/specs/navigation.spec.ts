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

  // Accounting is split into default-collapsed subgroups (Masters, Transactions,
  // Registers & Books) — expand one before asserting/clicking its items.
  async function toggleSubgroup(page: any, name: string) {
    const btn = nav(page).getByRole("button", { name, exact: true });
    if (await btn.isVisible()) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }

  test("all 5 module groups are visible", async ({ page }) => {
    const groups = ["Accounting", "Inventory", "Tax & Compliance", "Reports", "Settings"];
    for (const g of groups) {
      await expect(nav(page).getByRole("button", { name: g, exact: true })).toBeVisible();
    }
  });

  test("expand Accounting group shows items", async ({ page }) => {
    await toggleGroup(page, "Accounting");
    await toggleSubgroup(page, "Masters");
    await toggleSubgroup(page, "Registers & Books");
    await expect(sidebarLink(page, "Chart of Accounts")).toBeVisible();
    await expect(sidebarLink(page, "Vouchers")).toBeVisible();
    await expect(sidebarLink(page, "Reconciliation")).toBeVisible();
  });

  test("expand Inventory group shows item", async ({ page }) => {
    await toggleGroup(page, "Inventory");
    await expect(sidebarLink(page, "Stock & Inventory")).toBeVisible();
  });

  test("expand Tax & Compliance group shows subgroup + items", async ({ page }) => {
    await toggleGroup(page, "Tax & Compliance");
    await expect(sidebarLink(page, "GST")).toBeVisible();
    await expect(sidebarLink(page, "TDS / TCS")).toBeVisible();
  });

  test("expand Tax subgroup shows all GST pages", async ({ page }) => {
    await toggleGroup(page, "Tax & Compliance");
    await expect(sidebarLink(page, "GST")).toBeVisible();
    await expect(sidebarLink(page, "TDS / TCS")).toBeVisible();
    await sidebarLink(page, "GST").click();
    await page.waitForURL("**/gst");
    await expect(page.getByRole("tab", { name: "E-Invoice", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "E-Way Bill", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "HSN / SAC", exact: true })).toBeVisible();
  });

  test("expand Reports group shows items", async ({ page }) => {
    await toggleGroup(page, "Reports");
    await expect(sidebarLink(page, "Financial Reports")).toBeVisible();
  });

  test("expand Settings group shows items", async ({ page }) => {
    await toggleGroup(page, "Settings");
    await expect(sidebarLink(page, "Company Settings")).toBeVisible();
    await expect(sidebarLink(page, "Data Import / Export")).toBeVisible();
  });

  test("clicking a nav item navigates to the page", async ({ page }) => {
    await toggleGroup(page, "Accounting");
    await toggleSubgroup(page, "Masters");
    await sidebarLink(page, "Chart of Accounts").click();
    await page.waitForURL("**/chart-of-accounts");
  });

  test("every sidebar row fits on one line (no wrapping)", async ({ page }) => {
    // Expand every group so all nav items are rendered, then assert no row
    // exceeds a single-line height (wrapped rows measure ~48-52px vs ~32px).
    for (const g of ["Accounting", "Inventory", "Tax & Compliance", "Reports", "Settings"]) {
      await toggleGroup(page, g);
    }
    const wrappedRows = await nav(page)
      .locator("a, button")
      .evaluateAll((els: HTMLElement[]) =>
        els
          .filter((el: HTMLElement) => el.offsetParent !== null)
          .filter((el: HTMLElement) => el.getBoundingClientRect().height > 44)
          .map((el: HTMLElement) => (el.textContent || "").trim().slice(0, 40))
      );
    expect(wrappedRows, `sidebar rows wrapped: ${wrappedRows.join(", ")}`).toEqual([]);
  });

  test("Reports tab bar does not overflow its container", async ({ page }) => {
    // The 11-tab Reports bar used to overflow (scrollW 1317 > clientW 960 at
    // 1280px), cutting off Stock Summary/Movement/Ageing. On md+ it must fit
    // exactly; on mobile it may scroll (natural-width labels), which is fine
    // — the guard asserts desktop fits without horizontal overflow.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/reports");
    await page.waitForURL("**/reports");
    const tablist = page.getByRole("tablist");
    await expect(tablist).toBeVisible({ timeout: 10000 });
    const { clientW, scrollW } = await tablist.evaluate((el: HTMLElement) => ({
      clientW: el.clientWidth,
      scrollW: el.scrollWidth,
    }));
    expect(scrollW, `Reports tab bar overflows: ${clientW}px container vs ${scrollW}px content`).toBeLessThanOrEqual(clientW + 1);
    await expect(tablist.getByRole("tab", { name: /Stock Ageing/ })).toBeVisible();
  });

  test("brand logo navigates to dashboard", async ({ page }) => {
    await toggleGroup(page, "Reports");
    await sidebarLink(page, "Financial Reports").click();
    await page.waitForURL("**/reports");
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
    test("opens search modal with Ctrl+K", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await expect(page.getByPlaceholder("Search pages and actions...")).toBeVisible();
    });

    test("search finds pages", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder("Search pages and actions...").fill("voucher");
      await expect(page.locator('[data-search-item="true"]', { hasText: /Vouchers/ }).first()).toBeVisible();
    });

    test("search result navigates to page", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await page.getByPlaceholder("Search pages and actions...").fill("chart of");
      await page.locator('[data-search-item="true"]', { hasText: "Chart of Accounts" }).first().click();
      await page.waitForURL("**/chart-of-accounts");
    });

    test("escape closes search", async ({ page }) => {
      await page.keyboard.press("Control+k");
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
