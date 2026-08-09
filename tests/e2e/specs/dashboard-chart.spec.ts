import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

/**
 * Interactive dashboard chart (Income vs Expenses):
 *  - preset chips (3M/6M/12M) + Reset
 *  - scroll-to-zoom (native wheel listener on the chart wrapper)
 *  - drag-to-pan (pointer capture, accumulates the whole gesture)
 *  - keyboard nav (←/→ pan, +/− zoom, R reset) when the chart is focused
 *  - zoom window persists per FY across reload (localStorage)
 */
test.describe("Dashboard Income vs Expenses chart", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  const chart = (page: import("@playwright/test").Page) =>
    page.getByRole("group", { name: /income vs expenses chart/i });

  const monthHint = (page: import("@playwright/test").Page, n: number) =>
    page.getByText(`${n} months`, { exact: true });

  async function gotoDashboard(page: import("@playwright/test").Page) {
    await page.goto("/");
    await page.waitForURL("**/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await expect(chart(page)).toBeVisible({ timeout: 10000 });
  }

  function assertNoJsErrors(page: import("@playwright/test").Page) {
    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors: ${errors.join(" | ")}`);
    }
  }

  test("preset chips switch the window and Reset restores the full year", async ({ page }) => {
    await gotoDashboard(page);
    await expect(monthHint(page, 12)).toBeVisible();

    await page.getByRole("button", { name: "3M", exact: true }).click();
    await expect(monthHint(page, 3)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "6M", exact: true }).click();
    await expect(monthHint(page, 6)).toBeVisible();

    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(monthHint(page, 12)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);

    assertNoJsErrors(page);
  });

  test("scroll zooms in and out over the chart", async ({ page }) => {
    await gotoDashboard(page);
    await expect(monthHint(page, 12)).toBeVisible();

    const c = chart(page);
    await c.hover();
    await page.mouse.wheel(0, -200); // zoom in
    await expect(monthHint(page, 10)).toBeVisible();

    await page.mouse.wheel(0, 200); // zoom back out
    await expect(monthHint(page, 12)).toBeVisible();

    assertNoJsErrors(page);
  });

  test("drag pans the window and preserves its size", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByRole("button", { name: "6M", exact: true }).click();
    await expect(monthHint(page, 6)).toBeVisible();

    const firstTick = page.locator(".recharts-cartesian-axis-tick-value").first();
    const before = (await firstTick.textContent())?.trim() ?? "";

    const box = await chart(page).boundingBox();
    if (!box) throw new Error("chart has no bounding box");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Drag right to reveal earlier months.
    await page.mouse.move(box.x + box.width / 2 + 150, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const after = (await firstTick.textContent())?.trim() ?? "";
    expect(after).not.toBe(before);
    // Window size is preserved by a pan.
    await expect(monthHint(page, 6)).toBeVisible();

    assertNoJsErrors(page);
  });

  test("keyboard navigates the focused chart (pan, zoom, reset)", async ({ page }) => {
    await gotoDashboard(page);
    await expect(monthHint(page, 12)).toBeVisible();

    const c = chart(page);
    await c.focus();

    // Zoom in (12 → 10 months)
    await page.keyboard.press("+");
    await expect(monthHint(page, 10)).toBeVisible();

    // Pan right — first axis tick must change.
    const firstTick = page.locator(".recharts-cartesian-axis-tick-value").first();
    const before = (await firstTick.textContent())?.trim() ?? "";
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(300);
    const after = (await firstTick.textContent())?.trim() ?? "";
    expect(after).not.toBe(before);
    await expect(monthHint(page, 10)).toBeVisible();

    // Zoom out (10 → 12 months)
    await page.keyboard.press("-");
    await expect(monthHint(page, 12)).toBeVisible();

    // Reset restores the full year and hides Reset.
    await page.keyboard.press("R");
    await expect(monthHint(page, 12)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toHaveCount(0);

    assertNoJsErrors(page);
  });

  test("zoom window persists across reload", async ({ page }) => {
    await gotoDashboard(page);
    await page.getByRole("button", { name: "6M", exact: true }).click();
    await expect(monthHint(page, 6)).toBeVisible();

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(chart(page)).toBeVisible({ timeout: 10000 });
    await expect(monthHint(page, 6)).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeVisible();

    assertNoJsErrors(page);
  });
});
