import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { LEDGERS } from "../helpers/fixtures";

test.describe("Bank Reconciliation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/bank-reconciliation");
    await page.waitForLoadState("networkidle");
  });

  test("shows only bank ledgers in the dropdown", async ({ page }) => {
    await page.locator('input[role="combobox"]').click();
    await page.waitForTimeout(500);
    await expect(page.getByText("HDFC Bank - Current A/c")).toBeVisible({ timeout: 5000 });
    const cashDivs = page.locator("div").filter({ hasText: /^Cash$/ });
    const salesDivs = page.locator("div").filter({ hasText: /^Sales$/ });
    await expect(cashDivs).toHaveCount(0);
    await expect(salesDivs).toHaveCount(0);
  });

  test("page loads with heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /Bank Reconciliation/i })).toBeVisible();
  });

  test("import CSV button appears after selecting ledger", async ({ page }) => {
    await page.locator('input[role="combobox"]').click();
    await page.waitForTimeout(500);
    await page.getByText("HDFC Bank - Current A/c").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    // When no statement lines exist yet, the upload area is shown;
    // when lines exist, "Import New" button appears instead.
    const importBtn = page.getByText("Import New");
    const uploadArea = page.getByText("Upload a bank statement CSV");
    await expect(importBtn.or(uploadArea)).toBeVisible();
  });

  test("ledger selector opens and shows bank options", async ({ page }) => {
    const btn = page.locator('input[role="combobox"]');
    await btn.click();
    await page.waitForTimeout(500);
    // At least one option should be visible
    const options = page.locator("[role='option'], div[class*='cursor-pointer']").filter({ hasText: /bank/i });
    await expect(options.first()).toBeVisible({ timeout: 5000 });
  });

  test("selecting a ledger loads statement lines", async ({ page }) => {
    await page.locator('input[role="combobox"]').click();
    await page.waitForTimeout(500);
    await page.getByText("HDFC Bank - Current A/c").click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Summary section or empty state should appear
    const summaryVisible = await page.getByText(/unreconciled/i).first().isVisible().catch(() => false);
    const emptyVisible = await page.getByText(/no statement lines/i).first().isVisible().catch(() => false);
    expect(summaryVisible || emptyVisible).toBeTruthy();
  });

  // The unified Drawer (slide-in panel, shared Escape/backdrop conventions) has
  // real regression coverage here — the demo seed ships ~80 unreconciled HDFC
  // statement lines, so no API seeding or cleanup is needed.
  test.describe("Match Transaction drawer (shared Drawer component)", () => {
    async function openDrawer(page: Page) {
      await page.locator('input[role="combobox"]').click();
      await page.waitForTimeout(500);
      await page.getByText(LEDGERS.hdfcBank).click();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1200);
      const findMatch = page.locator('[title="Find Match"]').first();
      await expect(findMatch).toBeVisible({ timeout: 8000 });
      await findMatch.click();
      const dialog = page.getByRole("dialog").filter({ hasText: "Match Transaction" });
      await expect(dialog).toBeVisible({ timeout: 5000 });
      return dialog;
    }

    test("opens right-anchored with drawerIn slide animation", async ({ page }) => {
      const dialog = await openDrawer(page);

      // Right-anchored slide-in panel (w-[520px] on a 1280px viewport)
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThan(500);
      expect(box!.width).toBeGreaterThan(400);

      // New drawerIn keyframe animates the panel
      expect(await dialog.evaluate((el) => getComputedStyle(el).animationName)).toBe("drawerIn");
      // Backdrop fades in with the shared backdropIn animation
      const scrimAnim = await dialog.evaluate((el) => {
        const overlay = el.closest("div.fixed.inset-0");
        const scrim = overlay ? overlay.querySelector("div.absolute.inset-0") : null;
        return scrim ? getComputedStyle(scrim).animationName : "none";
      });
      expect(scrimAnim).toBe("backdropIn");
      expect(await dialog.getAttribute("aria-modal")).toBe("true");
    });

    test("closes on Escape (shared topmost-Escape hook)", async ({ page }) => {
      const dialog = await openDrawer(page);
      await page.keyboard.press("Escape");
      await expect(dialog).not.toBeVisible();
    });

    test("closes on backdrop click", async ({ page }) => {
      await openDrawer(page);
      // Left edge is backdrop (panel is right-anchored)
      await page.mouse.click(30, 450);
      await expect(page.getByRole("dialog").filter({ hasText: "Match Transaction" })).not.toBeVisible();
    });
  });
});
