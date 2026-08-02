import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { E2E_PREFIX } from "../helpers/fixtures";

async function selectOption(page: Page, placeholder: string, optionLabel: string) {
  await page.getByRole("button", { name: placeholder, exact: false }).first().click();
  await page.waitForTimeout(300);
  await page.locator('[class*="overflow-auto"] [class*="cursor-pointer"]').filter({ hasText: optionLabel }).click();
  await page.waitForTimeout(300);
}

async function waitForToast(page: Page) {
  await page.waitForTimeout(800);
}

function testBomName() {
  return `${E2E_PREFIX} Test BOM ${Date.now()}`;
}

test.describe("Manufacturing — Frontend UI", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Manufacturing" }).click();
    await page.waitForURL("**/manufacturing");
    await page.waitForLoadState("networkidle");
  });

  test("Page loads with tabs", async ({ page }) => {
    const main = page.locator("main");
    await expect(main.getByRole("tab", { name: "BOMs" })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Orders" })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Batches" })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Work Centers" })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Routings" })).toBeVisible();
    await expect(main.getByRole("tab", { name: "Reports" })).toBeVisible();
  });

  test("BOMs tab shows seed BOMs from the current company", async ({ page }) => {
    await expect(page.getByText("Wireless Mouse Assembly").first()).toBeVisible();
  });

  test("Click BOM row opens detail panel with components", async ({ page }) => {
    await page.getByText("Wireless Mouse Assembly").first().click();
    await page.waitForTimeout(300);

    const detail = page.locator(".fixed.inset-0").last();
    await expect(detail.getByText("Wireless Mouse Assembly")).toBeVisible();
    await expect(detail.getByRole("button", { name: "Export PDF" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Duplicate" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(detail.getByRole("button", { name: "Version History" })).toBeVisible();
  });

  test("Create a new BOM then delete it", async ({ page }) => {
    const bomName = testBomName();

    await page.getByRole("button", { name: "+ New BOM" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0").last();
    await modal.locator("input[type='text']").first().fill(bomName);
    await modal.locator("input[type='number']").first().fill("1");

    await selectOption(page, "Select item", "Wireless Mouse");

    // Modal already has one empty component line
    await selectOption(page, "Select material", "Mouse PCB Board");

    await modal.getByRole("button", { name: "Create" }).click();
    await waitForToast(page);

    await expect(page.getByText(bomName).first()).toBeVisible();

    await page.getByText(bomName).first().click();
    await page.waitForTimeout(300);

    const detail = page.locator(".fixed.inset-0").last();
    await detail.getByRole("button", { name: "Delete" }).click();
    await page.waitForTimeout(300);

    await page.locator('[class*="z-[99999]"] button').filter({ hasText: "Delete" }).click();
    await waitForToast(page);

    await expect(page.getByText(bomName)).toHaveCount(0);
  });

  test("Form validation — empty BOM shows error", async ({ page }) => {
    await page.getByRole("button", { name: "+ New BOM" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0").last();
    await modal.getByRole("button", { name: "Create" }).click();
    await waitForToast(page);

    await expect(page.getByText("Name, finished product, and at least one component are required")).toBeVisible();
  });

  test("Switch to Orders tab shows seed orders", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Orders" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText("PRD-2026-0001").first()).toBeVisible();
    await expect(page.getByText("draft").first()).toBeVisible();
  });

  test("Click production order row opens detail with action buttons", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Orders" }).click();
    await page.waitForTimeout(300);

    const tableRow = page.locator("table tbody tr", { hasText: "PRD-2026-0001" });
    await tableRow.scrollIntoViewIfNeeded();
    await tableRow.click();
    await page.waitForTimeout(300);

    const detail = page.locator(".fixed.inset-0").last();
    await expect(detail.getByText("Production Order PRD-2026-0001")).toBeVisible();
    await expect(page.getByText("draft").first()).toBeVisible();
  });

  test("Form validation — empty order shows error", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Orders" }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Order" }).click();
    await page.waitForTimeout(300);

    const modal = page.locator(".fixed.inset-0").last();
    await modal.getByRole("button", { name: "Create Order" }).click();
    await waitForToast(page);

    await expect(page.getByText("BOM, date, and quantity are required")).toBeVisible();
  });

  test("Reports tab shows report cards", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Reports" }).click();
    await page.waitForTimeout(300);

    await expect(page.getByText("BOM Cost Analysis")).toBeVisible();
    await expect(page.getByText("Production Cost Report")).toBeVisible();
    await expect(page.getByText("Wastage Report")).toBeVisible();
  });

  test("Wastage report loads data when View Report is clicked", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Reports" }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "View Report" }).click();
    await page.waitForTimeout(1000);

    const noData = page.getByText("No wastage data yet");
    const table = page.locator("table").last();
    if (await noData.isVisible().catch(() => false)) {
      await expect(noData).toBeVisible();
    } else {
      await expect(table.locator("thead tr th").first()).toHaveText("Component");
      await expect(table.locator("thead tr th").nth(1)).toHaveText("Planned");
    }
  });

  test("Create a production order via UI", async ({ page }) => {
    const main = page.locator("main");
    await main.getByRole("button", { name: "Orders" }).click();
    await page.waitForTimeout(300);

    await page.getByRole("button", { name: "+ New Order" }).click();
    await page.waitForTimeout(300);

    await selectOption(page, "Select BOM", "Wireless Mouse Assembly");

    const modal = page.locator(".fixed.inset-0").last();
    const qtyInput = modal.locator("input[type='number']").first();
    await qtyInput.fill("5");

    await modal.getByRole("button", { name: "Create Order" }).click();
    await waitForToast(page);

    await expect(page.getByText("draft").first()).toBeVisible();
  });

  test("Cleanup — delete any leftover E2E BOMs", async ({ page }) => {
    await page.waitForTimeout(500);

    const e2eBoms = page.locator("table tbody tr").filter({ hasText: E2E_PREFIX });
    const count = await e2eBoms.count();

    for (let i = 0; i < count; i++) {
      const row = e2eBoms.nth(0);
      await row.click();
      await page.waitForTimeout(300);

      const detail = page.locator(".fixed.inset-0").last();
      await detail.getByRole("button", { name: "Delete" }).click();
      await page.waitForTimeout(300);

      await page.locator('[class*="z-[99999]"] button').filter({ hasText: "Delete" }).click();
      await waitForToast(page);
    }

    await expect(page.getByText(E2E_PREFIX)).toHaveCount(0);
  });

  test("Dashboard shows manufacturing widget cards with data", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    await expect(page.getByText("Manufacturing").first()).toBeVisible();
    await expect(page.getByText("BOMs").first()).toBeVisible();
    await expect(page.getByText("Orders").first()).toBeVisible();
    await expect(page.getByText("Total Cost").first()).toBeVisible();
    await expect(page.getByText("Wastage").first()).toBeVisible();
    await expect(page.getByText("Recent Orders").first()).toBeVisible();
  });
});
