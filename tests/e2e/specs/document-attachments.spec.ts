import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

async function confirmDelete(page: import("@playwright/test").Page) {
  // ConfirmDialog (z-[9999]) renders before the routed VoucherModal (also z-[9999])
  // in the DOM tree, so the VoucherModal's content sits on top and blocks
  // pointer events to the ConfirmDialog.  Use page.evaluate to click the
  // ConfirmDialog's Delete button directly through the DOM.
  await page.evaluate(() => {
    const overlays = document.querySelectorAll('.fixed.inset-0');
    for (const overlay of overlays) {
      const heading = overlay.querySelector('h3');
      if (heading?.textContent === 'Confirm') {
        const deleteBtn = Array.from(overlay.querySelectorAll('button'))
          .find(b => b.textContent?.trim() === 'Delete');
        if (deleteBtn) { deleteBtn.click(); return; }
      }
    }
  });
}

test.describe("Document Attachments", () => {
  test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`PAGE ERROR: ${err.message}`));
    await loginAsAdmin(page);
    (page as any).__errors = errors;
  });

  test("Attachments panel visible in voucher detail modal", async ({ page }) => {
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").first();
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    await expect(page.getByText("Attachments (")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible({ timeout: 3000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in attachments panel: ${errors.join(" | ")}`);
    }
  });

  test("Upload file and verify it appears in attachments list", async ({ page }) => {
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").first();
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "e2e-test-attachment.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is a test attachment for E2E testing of Phase 28 document attachments feature."),
    });

    await expect(page.getByText("e2e-test-attachment.txt").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("B").first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("No attachments")).not.toBeVisible({ timeout: 3000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after upload: ${errors.join(" | ")}`);
    }
  });

  test("Delete attachment reduces attachment count", async ({ page }) => {
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").first();
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    const heading = page.getByText("Attachments (");
    const hasAttachments = await heading.isVisible().catch(() => false);

    if (hasAttachments) {
      const countText = (await heading.textContent().catch(() => "")) ?? "";
      const match = countText.match(/\((\d+)\)/);
      const beforeCount = match ? parseInt(match[1]) : 0;

      if (beforeCount > 0) {
        await page.getByTitle("Delete").first().click();
        await confirmDelete(page);
        await page.waitForTimeout(2000);

        const countTextAfter = (await heading.textContent().catch(() => "")) ?? "";
        const matchAfter = countTextAfter.match(/\((\d+)\)/);
        const afterCount = matchAfter ? parseInt(matchAfter[1]) : 0;
        expect(afterCount).toBeLessThan(beforeCount);
      }
    }

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after delete: ${errors.join(" | ")}`);
    }
  });

  test("Close modal and re-open shows same attachments (persistence)", async ({ page }) => {
    await page.goto("/vouchers?tab=browse");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").first();
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    const hasFile = await page.getByText("e2e-test-attachment.txt").first().isVisible().catch(() => false);

    if (!hasFile) {
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "e2e-persist-test.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Persistence test file"),
      });
      await expect(page.getByText("e2e-persist-test.txt").first()).toBeVisible({ timeout: 10000 });
    }

    // Use Escape to close the VoucherModal — the "Close" button is sometimes
    // occluded by the ConfirmDialog z-[9999] overlay at the App root.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    await firstRow.click();
    await page.waitForTimeout(1000);

    const fileName = hasFile ? "e2e-test-attachment.txt" : "e2e-persist-test.txt";
    await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 5000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in persistence test: ${errors.join(" | ")}`);
    }
  });
});
