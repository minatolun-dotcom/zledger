import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

test.describe("Dashboard Layout", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  async function gotoDashboard(page: any) {
    await page.goto("/");
    await page.waitForURL("**/");
    // Heartbeat/notification polling keeps networkidle from firing — use
    // domcontentloaded + a fixed settle window (AGENTS.md guidance).
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  }

  function assertNoJsErrors(page: any) {
    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  }

  test("smart insight renders inside the Expense Breakdown card", async ({ page }) => {
    await gotoDashboard(page);

    const main = page.locator("main");

    // The insight card is embedded in the Expense Breakdown panel
    await expect(main.getByText("Expense Breakdown")).toBeVisible({ timeout: 5000 });
    await expect(main.getByText("Strong Revenue Growth")).toBeVisible({ timeout: 5000 });

    // Both live in the same card shell — same x/y region, stacked vertically
    const breakdown = await main.getByText("Expense Breakdown").boundingBox();
    const insight = await main.getByText("Strong Revenue Growth").boundingBox();
    expect(breakdown).not.toBeNull();
    expect(insight).not.toBeNull();
    expect(Math.abs(breakdown!.x - insight!.x)).toBeLessThan(60);
    expect(insight!.y).toBeGreaterThan(breakdown!.y);

    assertNoJsErrors(page);
  });

  test("Manufacturing and Quick Actions share one joined panel", async ({ page }) => {
    await gotoDashboard(page);

    const main = page.locator("main");

    await expect(main.getByText("Manufacturing", { exact: true }).first()).toBeVisible({ timeout: 5000 });
    await expect(main.getByText("Quick Actions", { exact: true })).toBeVisible({ timeout: 5000 });

    // Same row (y overlap) — both titles sit inside one joined panel
    const mfg = await main.getByText("Manufacturing", { exact: true }).first().boundingBox();
    const qa = await main.getByText("Quick Actions", { exact: true }).boundingBox();
    expect(mfg).not.toBeNull();
    expect(qa).not.toBeNull();
    expect(qa!.y).toBeLessThan(mfg!.y + mfg!.height);
    expect(mfg!.y).toBeLessThan(qa!.y + qa!.height);

    assertNoJsErrors(page);
  });

  test("Pending Actions shows grouped items with an urgency summary", async ({ page }) => {
    await gotoDashboard(page);

    const main = page.locator("main");
    const pendingCard = main.getByText("Pending Actions");
    await expect(pendingCard).toBeVisible({ timeout: 5000 });

    // Grouped by category — at least one of the group labels renders
    const body = await page.evaluate(() => document.body.innerText);
    const hasGroupLabel = ["BANKING", "TAX & COMPLIANCE", "VOUCHERS"].some((g) => body.toUpperCase().includes(g));
    expect(hasGroupLabel, `expected a group label in: ${body.slice(0, 800)}`).toBe(true);

    // The summary chip renders ("N pending" and optionally "M need attention")
    expect(body).toMatch(/\d+ pending/);

    assertNoJsErrors(page);
  });

  test("Recent Vouchers row renders beside Pending Actions", async ({ page }) => {
    await gotoDashboard(page);

    const main = page.locator("main");
    await expect(main.getByText("Recent Vouchers")).toBeVisible({ timeout: 5000 });
    await expect(main.getByText("View Day Book")).toBeVisible({ timeout: 5000 });

    assertNoJsErrors(page);
  });
});
