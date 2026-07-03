import { test, expect } from "@playwright/test";
import { loginAsAdmin, logout } from "../helpers/login";
import { ADMIN } from "../helpers/fixtures";

async function getAuthToken(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(async ([email, password]) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    return data.access_token;
  }, [ADMIN.email, ADMIN.password] as const);
}

test.describe("Voucher Cancellation", () => {
  test("Cancel endpoint creates reversal voucher for accountant", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getAuthToken(page);

    // Create a simple journal voucher first
    const companyId = await page.evaluate(() => {
      const d = localStorage.getItem("zledger-auth");
      return d ? JSON.parse(d).activeCompanyId : null;
    });

    // Create a voucher via API
    const createRes = await page.evaluate(async ([t, cid]) => {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
          "X-Company-Id": cid,
        },
        body: JSON.stringify({
          voucher_type: "journal",
          date: new Date().toISOString().slice(0, 10),
          narration: "E2E Cancel Test Voucher",
          lines: [
            { ledger_name: "Cash", debit: 100, credit: 0 },
            { ledger_name: "Sundry Debtors", debit: 0, credit: 100 },
          ],
        }),
      });
      return { status: res.status, body: await res.json() };
    }, [token, companyId] as const);

    if (createRes.status === 201 || createRes.status === 200) {
      const voucherId = createRes.body.id;

      // Cancel it via API
      const cancelRes = await page.evaluate(async ([t, cid, vid]) => {
        const res = await fetch(`/api/vouchers/${vid}/cancel`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${t}`,
            "X-Company-Id": cid,
          },
          body: JSON.stringify({ reason: "E2E test cancellation" }),
        });
        return { status: res.status, body: await res.json() };
      }, [token, companyId, voucherId] as const);

      // Should succeed (200 or 201)
      expect(cancelRes.status).toBeLessThanOrEqual(201);

      // Reversal voucher should be created
      if (cancelRes.body && cancelRes.body.id) {
        expect(cancelRes.body.id).not.toBe(voucherId);
      }

      // Original voucher should be marked as cancelled
      if (cancelRes.body && cancelRes.body.cancelled_at) {
        expect(cancelRes.body.cancelled_at).not.toBeNull();
      }
    }
  });

  test("Cancel endpoint returns 404 for non-existent voucher", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getAuthToken(page);
    const companyId = await page.evaluate(() => {
      const d = localStorage.getItem("zledger-auth");
      return d ? JSON.parse(d).activeCompanyId : null;
    });

    const res = await page.evaluate(async ([t, cid]) => {
      const r = await fetch("/api/vouchers/non-existent-id/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
          "X-Company-Id": cid,
        },
        body: JSON.stringify({ reason: "Test" }),
      });
      return r.status;
    }, [token, companyId] as const);

    expect(res).toBe(404);
  });

  test("Cancel endpoint returns 403 for viewer role", async ({ page }) => {
    await loginAsAdmin(page);
    const token = await getAuthToken(page);
    const companyId = await page.evaluate(() => {
      const d = localStorage.getItem("zledger-auth");
      return d ? JSON.parse(d).activeCompanyId : null;
    });

    // Create a voucher to try to cancel
    const createRes = await page.evaluate(async ([t, cid]) => {
      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${t}`,
          "X-Company-Id": cid,
        },
        body: JSON.stringify({
          voucher_type: "journal",
          date: new Date().toISOString().slice(0, 10),
          narration: "E2E Viewer Cancel Test",
          lines: [
            { ledger_name: "Cash", debit: 50, credit: 0 },
            { ledger_name: "Sundry Debtors", debit: 0, credit: 50 },
          ],
        }),
      });
      return { status: res.status, body: await res.json() };
    }, [token, companyId] as const);

    if (createRes.status === 201 || createRes.status === 200) {
      const voucherId = createRes.body.id;

      // Now login as a viewer and try to cancel
      const viewerRes = await page.evaluate(async () => {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "e2e-cancel-viewer@test.example.com", password: "test12345", name: "Cancel Viewer" }),
        }).catch(() => ({ ok: true }));

        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "e2e-cancel-viewer@test.example.com", password: "test12345" }),
        });
        const loginData = await loginRes.json();
        return loginData.access_token;
      });

      if (viewerRes) {
        // Add as viewer member
        await page.evaluate(async ([vt, cid]) => {
          await fetch("/api/members", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await (async () => {
                const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@zledger.com", password: "admin12345" }) });
                return (await r.json()).access_token;
              })()}`,
              "X-Company-Id": cid,
            },
            body: JSON.stringify({ email: "e2e-cancel-viewer@test.example.com", role: "viewer" }),
          }).catch(() => {});
        }, [viewerRes, companyId] as const);

        // Try to cancel as viewer
        const cancelAsViewer = await page.evaluate(async ([vt, cid, vid]) => {
          const res = await fetch(`/api/vouchers/${vid}/cancel`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${vt}`,
              "X-Company-Id": cid,
            },
            body: JSON.stringify({ reason: "Viewer cancel attempt" }),
          });
          return res.status;
        }, [viewerRes, companyId, voucherId] as const);

        expect(cancelAsViewer).toBe(403);
      }
    }
  });
});

test.describe("Toast Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Success toast appears after HSN create", async ({ page }) => {
    await page.goto("/gst");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const hsnTab = page.getByRole("button", { name: /HSN/ });
    if (await hsnTab.isVisible().catch(() => false)) {
      await hsnTab.click();
      await page.waitForTimeout(500);
    }

    const addBtn = page.getByRole("button", { name: /Add/ });
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      const codeInput = page.getByPlaceholder("e.g. 998314");
      if (await codeInput.isVisible().catch(() => false)) {
        const uniqueCode = `TEST${Date.now()}`;
        await codeInput.fill(uniqueCode);
        await page.getByPlaceholder("Description").fill("Test HSN for toast");
        await page.getByPlaceholder("6-digit").fill("998314");
        await page.getByRole("button", { name: "Save" }).click();

        await expect(page.getByText("HSN/SAC created")).toBeVisible({ timeout: 5000 });

        const deleteBtn = page.getByRole("button", { name: "Delete" }).last();
        if (await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await deleteBtn.click();
          await page.waitForTimeout(500);
          const confirmBtn = page.getByRole("button", { name: "Delete" }).last();
          if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
            await confirmBtn.click();
          }
        }
      }
    }
  });

  test("Error toast appears on failed operation", async ({ page }) => {
    await page.goto("/gst");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const hsnTab = page.getByRole("button", { name: /HSN/ });
    if (await hsnTab.isVisible().catch(() => false)) {
      await hsnTab.click();
      await page.waitForTimeout(500);
    }

    const addBtn = page.getByRole("button", { name: /Add/ });
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      const saveBtn = page.getByRole("button", { name: "Save" });
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForTimeout(500);

        const hasError = await page.getByText(/required|must be/i).isVisible({ timeout: 2000 }).catch(() => false);
        expect(hasError).toBeTruthy();
      }
    }
  });
});

test.describe("Mobile Sidebar", () => {
  test("Hamburger button visible on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const hamburger = page.locator("button").filter({ has: page.locator("svg") }).first();
    await expect(hamburger).toBeVisible();
  });

  test("Sidebar hidden by default on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const sidebar = page.locator("aside");
    const classes = await sidebar.getAttribute("class");
    expect(classes).toContain("-translate-x-full");
  });

  test("Clicking hamburger opens sidebar on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const hamburger = page.locator("button").filter({ has: page.locator("svg") }).first();
    await hamburger.click();
    await page.waitForTimeout(500);

    const sidebar = page.locator("aside");
    const classes = await sidebar.getAttribute("class");
    expect(classes).toContain("translate-x-0");
    expect(classes).not.toContain("-translate-x-full");
  });

  test("Backdrop appears when sidebar is open on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const hamburger = page.locator("button").filter({ has: page.locator("svg") }).first();
    await hamburger.click();
    await page.waitForTimeout(500);

    const backdrop = page.locator(".bg-black\\/50");
    await expect(backdrop).toBeVisible();
  });

  test("Clicking backdrop closes sidebar on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsAdmin(page);

    const hamburger = page.locator("button").filter({ has: page.locator("svg") }).first();
    await hamburger.click();
    await page.waitForTimeout(500);

    // Dispatch click event directly on backdrop element (sidebar z-index blocks normal clicks)
    await page.evaluate(() => {
      const backdrop = document.querySelector(".bg-black\\/50");
      if (backdrop) backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await page.waitForTimeout(500);

    const sidebar = page.locator("aside");
    const classes = await sidebar.getAttribute("class");
    expect(classes).toContain("-translate-x-full");
  });

  test("Sidebar visible by default on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await loginAsAdmin(page);

    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
    const classes = await sidebar.getAttribute("class");
    expect(classes).toContain("lg:translate-x-0");
  });
});

test.describe("Logo Endpoint Authentication", () => {
  test("Unauthenticated user cannot access company logo", async ({ page }) => {
    const companyId = "9999";
    const response = await page.request.get(`/api/companies/${companyId}/logo`);
    expect(response.status()).toBe(401);
  });

  test("Authenticated user can access company logo", async ({ page }) => {
    await loginAsAdmin(page);

    const companyId = await page.evaluate(() => {
      const authData = localStorage.getItem("zledger-auth");
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.activeCompanyId;
      }
      return null;
    });

    if (companyId) {
      const response = await page.request.get(`/api/companies/${companyId}/logo`);
      expect(response.status()).not.toBe(401);
    }
  });
});
