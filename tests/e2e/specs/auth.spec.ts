import { test, expect } from "@playwright/test";
import { loginAsAdmin, logout } from "../helpers/login";
import { ADMIN } from "../helpers/fixtures";

test.describe("Authentication", () => {
  test("shows login page", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Sign in to your Zledger workspace")).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("wrong@email.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/Invalid email|API error/)).toBeVisible();
  });

  test("successful login redirects to company select", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(ADMIN.email);
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL("**/companies");
    await expect(page.getByText("Select Company")).toBeVisible();
  });

  test("full login flow to dashboard", async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole("button", { name: "Zledger", exact: true })).toBeVisible();
  });

  test("logout redirects to login", async ({ page }) => {
    await loginAsAdmin(page);
    await logout(page);
    await expect(page.getByText("Sign in to your Zledger workspace")).toBeVisible();
  });

  test("unauthenticated access redirects to login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page.getByText("Sign in to your Zledger workspace")).toBeVisible();
  });
});
