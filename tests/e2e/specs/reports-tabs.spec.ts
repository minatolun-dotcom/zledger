import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Reports Page — All Tabs", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole("link", { name: "Financial Reports" }).click();
    await page.waitForURL("**/reports");
    await page.waitForLoadState("networkidle");
  });

  test("Reports page loads with Trial Balance tab", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Trial Balance", exact: true })).toBeVisible();
  });

  test("Switch to Profit & Loss tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Profit & Loss", exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Income" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
  });

  test("Switch to Balance Sheet tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Balance Sheet", exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Liabilities" })).toBeVisible();
  });

  test("Switch to Cash Flow tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Cash Flow", exact: true }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Opening Balance")).toBeVisible();
  });

  test("Switch to Aging tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Aging", exact: true }).click();
    await page.waitForTimeout(500);
  });

  test("Switch to Outstanding tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Outstanding", exact: true }).click();
    await page.waitForTimeout(500);
  });

  test("Switch to Stock Summary tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Stock Summary", exact: true }).click();
    await page.waitForTimeout(500);
  });

  test("PDF export buttons are available", async ({ page }) => {
    const pdfBtn = page.getByRole("button", { name: /PDF/ }).first();
    await expect(pdfBtn).toBeVisible();
  });
});
