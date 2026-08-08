import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { COMPANY } from "../helpers/fixtures";

const searchInput = (page: Page) => page.getByPlaceholder("Search pages and actions...");

test.describe("Shared Modal overlays", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test.describe("Ctrl+K search overlay (align=top)", () => {
    test("opens top-anchored and auto-focuses the input", async ({ page }) => {
      await page.keyboard.press("Control+k");
      const input = searchInput(page);
      await expect(input).toBeVisible();

      // Top-anchored command palette: input sits near the top of the viewport
      // (Modal renders with items-start pt-[15vh] when align="top").
      const box = await input.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThan(300);

      // Auto-focus: keyboard input lands without clicking
      await expect(input).toBeFocused();
      await page.keyboard.type("voucher");
      await expect(input).toHaveValue("voucher");
    });

    test("search finds results and navigates", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await searchInput(page).fill("chart of");
      await page.locator('[data-search-item="true"]', { hasText: "Chart of Accounts" }).first().click();
      await page.waitForURL("**/chart-of-accounts");
    });

    test("closes on Escape", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await expect(searchInput(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(searchInput(page)).not.toBeVisible();
    });

    test("closes on backdrop click", async ({ page }) => {
      await page.keyboard.press("Control+k");
      await expect(searchInput(page)).toBeVisible();
      // The palette is top-anchored; the bottom-left corner is backdrop.
      await page.mouse.click(50, 680);
      await expect(searchInput(page)).not.toBeVisible();
    });
  });

  test.describe("Switch-company modal (/companies with active company)", () => {
    test("opens and lists companies", async ({ page }) => {
      await page.goto("/companies");
      await expect(page.getByRole("heading", { name: "Switch Company" })).toBeVisible();
      await expect(page.getByText(COMPANY.name, { exact: true })).toBeVisible();
    });

    test("closes on Escape and navigates back", async ({ page }) => {
      await page.goto("/companies");
      await expect(page.getByRole("heading", { name: "Switch Company" })).toBeVisible();
      await page.keyboard.press("Escape");
      await page.waitForURL("/");
      await expect(page.getByRole("heading", { name: "Switch Company" })).not.toBeVisible();
    });

    test("closes on backdrop click and navigates back", async ({ page }) => {
      await page.goto("/companies");
      await expect(page.getByRole("heading", { name: "Switch Company" })).toBeVisible();
      // Panel is centered max-w-lg; the left edge is backdrop.
      await page.mouse.click(50, 360);
      await page.waitForURL("/");
      await expect(page.getByRole("heading", { name: "Switch Company" })).not.toBeVisible();
    });
  });

  test.describe("Theme persistence across full page loads", () => {
    test("dark theme survives navigating to /companies (no TopHeader there)", async ({ page }) => {
      // Switch to dark via the profile dropdown (UI path)
      await page.locator("button.rounded-full").first().click();
      await page.getByRole("button", { name: "Dark" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);

      // Full page load to /companies — initTheme() in main.tsx must re-apply dark
      await page.goto("/companies");
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect(page.getByRole("heading", { name: "Switch Company" })).toBeVisible();

      // Switch modal panel renders with the dark surface (#16161f)
      const panelBg = await page.evaluate(() => {
        const h = [...document.querySelectorAll("h1")].find((el) => el.textContent?.includes("Switch Company"));
        const panel = h ? h.closest("div.rounded-2xl") : null;
        return panel ? getComputedStyle(panel).backgroundColor : "not-found";
      });
      expect(panelBg).toBe("rgb(22, 22, 31)");
    });

    test("light theme stays light on /companies", async ({ page }) => {
      await page.locator("button.rounded-full").first().click();
      await page.getByRole("button", { name: "Light" }).click();
      await expect(page.locator("html")).not.toHaveClass(/dark/);
      await page.goto("/companies");
      await expect(page.locator("html")).not.toHaveClass(/dark/);
    });
  });
});
