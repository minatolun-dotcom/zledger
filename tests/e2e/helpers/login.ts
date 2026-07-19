import type { Page } from "@playwright/test";
import { ADMIN, COMPANY } from "./fixtures";

export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.waitForURL("**/login");

  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/companies");

  const companyLink = page.getByText(COMPANY.name, { exact: true });
  await companyLink.waitFor({ state: "visible", timeout: 30000 });
  await companyLink.click();

  await page.waitForURL("/");
}

export async function logout(page: Page) {
  // The profile trigger is the round avatar button in the header (no visible
  // text — it renders the user's initial). Open it, then click "Sign Out".
  const avatar = page.locator("button.rounded-full").first();
  if (await avatar.isVisible().catch(() => false)) {
    await avatar.click();
    await page.getByText("Sign Out").click();
  }
  await page.waitForURL("**/login");
}
