import { test, expect, type Page } from "@playwright/test";
import { ADMIN, COMPANY } from "../helpers/fixtures";

const VIEWER = {
  email: "e2e-viewer-role@test.example.com",
  password: "test12345",
  name: "E2E Viewer",
};

const ACCOUNTANT = {
  email: "e2e-accountant-role@test.example.com",
  password: "test12345",
  name: "E2E Accountant",
};

async function apiSetup(page: Page, user: { email: string; name: string; password: string }, role: string) {
  // Register user (ignore if exists)
  await page.evaluate(async ([u]) => {
    await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(u),
    }).catch(() => {});
  }, [user]);

  // Login as admin
  const token = await page.evaluate(async ([email, password]) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return data.access_token;
  }, [ADMIN.email, ADMIN.password] as const);

  // Resolve admin's active company id (required by /api/members)
  const companyId = await page.evaluate(async ([t]) => {
    const res = await fetch("/api/companies", {
      headers: { Authorization: `Bearer ${t}` },
    });
    const data = await res.json();
    const list = Array.isArray(data) ? data : data?.companies ?? [];
    return list[0]?.id ?? null;
  }, [token]);

  // Add as member (ignore if already a member)
  await page.evaluate(async ([email, role, t, cid]) => {
    await fetch("/api/members", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        "X-Company-Id": cid,
      },
      body: JSON.stringify({ email, role }),
    }).catch(() => {});
  }, [user.email, role, token, companyId]);
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.waitForURL("**/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/companies");
  await page.getByText(COMPANY.name, { exact: true }).click();
  await page.waitForURL("/");
}

test.describe("Role Enforcement — Viewer", () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await apiSetup(page, VIEWER, "viewer");
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, VIEWER.email, VIEWER.password);
  });

  test("COA page hides create button for viewer", async ({ page }) => {
    await page.getByRole("link", { name: "Chart of Accounts" }).click();
    await page.waitForURL("**/chart-of-accounts");
    await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New/ })).toHaveCount(0);
  });

  test("Inventory page hides create button for viewer", async ({ page }) => {
    await page.getByRole("link", { name: "Inventory" }).click();
    await page.waitForURL("**/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New (Group|Item|Entry)/ })).toHaveCount(0);
  });

  test("Vouchers page hides create button for viewer", async ({ page }) => {
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
    await expect(page.getByRole("heading", { name: "Vouchers", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /New Voucher/ })).toHaveCount(0);
  });

  test("Financial Years page hides create button for viewer", async ({ page }) => {
    await page.getByRole("link", { name: "Financial Years" }).click();
    await page.waitForURL("**/financial-years");
    await expect(page.getByRole("heading", { name: "Financial Years" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New Financial Year/ })).toHaveCount(0);
  });

  test("Members page hides add button for viewer", async ({ page }) => {
    await page.goto("/members");
    await page.waitForURL("**/members");
    await expect(page.getByRole("button", { name: /Add Member/ })).toHaveCount(0);
  });

  test("Role badge shows viewer in sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("span").filter({ hasText: /^viewer$/ })).toBeVisible();
  });
});

test.describe("Role Enforcement — Accountant", () => {
  test.beforeAll(async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await apiSetup(page, ACCOUNTANT, "accountant");
    await ctx.close();
  });

  test.beforeEach(async ({ page }) => {
    await loginAs(page, ACCOUNTANT.email, ACCOUNTANT.password);
  });

  test("COA page shows create button for accountant", async ({ page }) => {
    await page.getByRole("link", { name: "Chart of Accounts" }).click();
    await page.waitForURL("**/chart-of-accounts");
    await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New/ }).first()).toBeVisible();
  });

  test("Inventory page shows create button for accountant", async ({ page }) => {
    await page.getByRole("link", { name: "Inventory" }).click();
    await page.waitForURL("**/inventory");
    await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
    await expect(page.getByRole("button", { name: /New (Group|Item|Entry)/ }).first()).toBeVisible();
  });

  test("Vouchers page loads for accountant", async ({ page }) => {
    await page.getByRole("link", { name: "Vouchers" }).click();
    await page.waitForURL("**/vouchers");
    await expect(page.getByRole("heading", { name: "Vouchers", exact: true })).toBeVisible();
    // Accountant should see the page (viewer also sees it, just without create button)
    // The key test is that the page loads successfully
  });

  test("Role badge shows accountant in sidebar", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("span").filter({ hasText: /^accountant$/ })).toBeVisible();
  });

  test("Members page hides add button for accountant (owner-only)", async ({ page }) => {
    await page.goto("/members");
    await page.waitForURL("**/members");
    await expect(page.getByRole("heading", { name: "Company Members" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Member/ })).toHaveCount(0);
  });
});

test.describe("Role Enforcement — Owner", () => {
  test("Owner sees role badge in sidebar", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await expect(page.locator("span").filter({ hasText: /^owner$/ })).toBeVisible();
  });

  test("Owner can access members page with add button", async ({ page }) => {
    await loginAs(page, ADMIN.email, ADMIN.password);
    await page.goto("/members");
    await page.waitForURL("**/members");
    await expect(page.getByRole("heading", { name: "Company Members" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Add Member/ })).toBeVisible();
  });
});
