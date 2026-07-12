import { test, expect, type Page } from "@playwright/test";

const ADMIN_EMAIL = "admin@zledger.com";
const ADMIN_PWD = "katheikei"; // matches BOOTSTRAP_ADMIN_PASSWORD in .env

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Password").fill(ADMIN_PWD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 10000 });
  // After login the app may drop on the company-select screen (multiple companies)
  if (page.url().includes("/companies")) {
    await page.getByText("Apex Enterprises").click();
    await page.waitForURL((u) => u.pathname === "/", { timeout: 10000 });
  }
}

test("Fixed Assets UI: tabs, create+delete category, create+delete asset, run depreciation", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));

  await loginAsAdmin(page);
  await page.goto("/fixed-assets");

  // Three tabs render
  await expect(page.getByRole("button", { name: "Asset Register" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Categories" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Depreciation" })).toBeVisible();

  // ── Categories: create then delete ──
  await page.getByRole("button", { name: "Categories" }).click();
  await expect(page.getByRole("button", { name: "+ New Category" })).toBeVisible();

  const catName = `UI Cat ${Date.now()}`;
  await page.getByRole("button", { name: "+ New Category" }).click();
  await page.getByPlaceholder("e.g. Computers").fill(catName);
  await page.getByRole("spinbutton").first().fill("12.5"); // Rate %
  await page.getByRole("spinbutton").nth(1).fill("8"); // Useful life
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page.getByText(catName)).toBeVisible();

  // Edit the category
  const catRow = page.locator("tr", { hasText: catName });
  await catRow.getByRole("button").last().click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Update Category" })).toBeVisible();
  await page.getByPlaceholder("e.g. Computers").fill(`${catName} (edited)`);
  await page.getByRole("button", { name: "Update Category" }).click();
  await expect(page.getByText(`${catName} (edited)`)).toBeVisible();

  // Delete the category
  const catRow2 = page.locator("tr", { hasText: `${catName} (edited)` });
  await catRow2.getByRole("button").last().click();
  await page.getByRole("button", { name: "Delete" }).click(); // context menu item
  await page.getByRole("button", { name: "Delete" }).click(); // confirm dialog
  await expect(page.getByText(`${catName} (edited)`)).toHaveCount(0);

  // ── Asset Register: create then delete ──
  await page.getByRole("button", { name: "Asset Register" }).click();
  await expect(page.getByRole("button", { name: "+ New Asset" })).toBeVisible();

  const assetName = `UI Asset ${Date.now()}`;
  await page.getByRole("button", { name: "+ New Asset" }).click();
  await page.getByPlaceholder("e.g. Dell Laptop").fill(assetName);
  await page.getByRole("spinbutton").first().fill("50000"); // Cost
  await page.getByRole("spinbutton").nth(1).fill("5000"); // Salvage
  await page.getByRole("button", { name: "Create Asset" }).click();
  await expect(page.getByText(assetName)).toBeVisible();

  // Edit the asset
  const assetRow = page.locator("tr", { hasText: assetName });
  await assetRow.getByRole("button").last().click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("button", { name: "Update Asset" })).toBeVisible();
  await page.getByPlaceholder("e.g. Dell Laptop").fill(`${assetName} (edited)`);
  await page.getByRole("button", { name: "Update Asset" }).click();
  await expect(page.getByText(`${assetName} (edited)`)).toBeVisible();

  // Delete the asset
  const assetRow2 = page.locator("tr", { hasText: `${assetName} (edited)` });
  await assetRow2.getByRole("button").last().click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`${assetName} (edited)`)).toHaveCount(0);

  // ── Depreciation tab ──
  await page.getByRole("button", { name: "Depreciation" }).click();
  await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run Depreciation" })).toBeVisible();

  // Preview the schedule
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(
    page.getByText("Total Depreciation").or(page.getByText("No depreciation to post")),
  ).toBeVisible({ timeout: 10000 });

  // Run depreciation (posts a journal, or is a safe no-op if already posted)
  await page.getByRole("button", { name: "Run Depreciation" }).click();
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await expect(page.getByText(/posted|No new depreciation/i)).toBeVisible({ timeout: 10000 });

  // Reload schedule still renders
  await expect(
    page.getByText("Total Depreciation").or(page.getByText("No depreciation to post")),
  ).toBeVisible();

  expect(errors, `Console/page errors:\n${errors.join("\n")}`).toEqual([]);
});
