import type { Page } from "@playwright/test";
import { ADMIN, COMPANY } from "./fixtures";

export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.waitForURL("**/login");

  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/companies");

  await page.getByText(COMPANY.name, { exact: true }).click();

  await page.waitForURL("/");
}

export async function logout(page: Page) {
  const profileButton = page.locator("button").filter({ hasText: ADMIN.name });
  if (await profileButton.isVisible()) {
    await profileButton.click();
    await page.getByText("Sign Out").click();
  }
  await page.waitForURL("**/login");
}
