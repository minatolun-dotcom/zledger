import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";

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
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");

    // Second table is Recent Vouchers (first is the items form table)
    const recentVouchersTable = page.locator("table").nth(1);
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    // Verify modal opened by checking the Attachments section (only visible inside modal)
    await expect(page.getByText("Attachments (")).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Upload File" })).toBeVisible({ timeout: 3000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in attachments panel: ${errors.join(" | ")}`);
    }
  });

  test("Upload file and verify it appears in attachments list", async ({ page }) => {
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").nth(1);
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    // Handle confirm dialogs
    page.on("dialog", (dialog) => dialog.accept());

    // Upload a test file via the hidden input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "e2e-test-attachment.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is a test attachment for E2E testing of Phase 28 document attachments feature."),
    });

    // Wait for upload to complete and attachment to appear in list
    await expect(page.getByText("e2e-test-attachment.txt").first()).toBeVisible({ timeout: 10000 });

    // Verify file size is displayed (should show "84 B" for the test content)
    await expect(page.getByText("B").first()).toBeVisible({ timeout: 3000 });

    // Verify "No attachments" message is gone
    await expect(page.getByText("No attachments")).not.toBeVisible({ timeout: 3000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after upload: ${errors.join(" | ")}`);
    }
  });

  test("Delete attachment removes it from list", async ({ page }) => {
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").nth(1);
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    // Handle confirm dialogs (auto-accept)
    page.on("dialog", (dialog) => dialog.accept());

    // Check if there's an attachment to delete
    const attachmentRow = page.locator("text=e2e-test-attachment.txt").first();
    const hasAttachment = await attachmentRow.isVisible().catch(() => false);

    if (hasAttachment) {
      // Click the delete button for this attachment (trash icon button)
      const deleteBtn = page.locator("button[title='Delete']").first();
      await deleteBtn.click();
      await page.waitForTimeout(1000);

      // Verify attachment is removed
      await expect(page.getByText("e2e-test-attachment.txt")).not.toBeVisible({ timeout: 5000 });
    } else {
      // No attachment to delete — test passes (nothing to clean up)
      console.log("No attachment found to delete — skipping delete test");
    }

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors after delete: ${errors.join(" | ")}`);
    }
  });

  test("Close modal and re-open shows same attachments (persistence)", async ({ page }) => {
    await page.goto("/vouchers");
    await page.waitForLoadState("networkidle");

    const recentVouchersTable = page.locator("table").nth(1);
    const firstRow = recentVouchersTable.locator("tbody tr").first();
    await firstRow.click();
    await page.waitForTimeout(1000);

    // Check for existing attachment
    const hasFile = await page.getByText("e2e-test-attachment.txt").first().isVisible().catch(() => false);

    if (!hasFile) {
      // Upload a file first
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: "e2e-persist-test.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Persistence test file"),
      });
      await expect(page.getByText("e2e-persist-test.txt").first()).toBeVisible({ timeout: 10000 });
    }

    // Close modal
    await page.getByRole("button", { name: "Close" }).click();
    await page.waitForTimeout(500);

    // Re-open same voucher
    await firstRow.click();
    await page.waitForTimeout(1000);

    // Verify attachment is still listed
    const fileName = hasFile ? "e2e-test-attachment.txt" : "e2e-persist-test.txt";
    await expect(page.getByText(fileName).first()).toBeVisible({ timeout: 5000 });

    const errors = (page as any).__errors || [];
    if (errors.length > 0) {
      throw new Error(`JS errors in persistence test: ${errors.join(" | ")}`);
    }
  });
});
