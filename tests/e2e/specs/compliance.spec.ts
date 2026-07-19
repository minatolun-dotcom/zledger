import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { apiGet } from "../helpers/pdf";

/**
 * Compliance endpoints (Ind-AS / Schedule III, Income Tax old & new regime,
 * ICAI NCE, GST status). These are module-gated by "compliance".
 */
test.describe("Indian Compliance (Ind-AS / Income Tax / ICAI NCE)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  async function firstFyId(page: import("@playwright/test").Page): Promise<string> {
    const fys = await apiGet<Array<{ id: string; name: string }>>(page, "/coa/financial-years");
    expect(fys.length).toBeGreaterThan(0);
    return fys[0].id;
  }

  test("Schedule III balance sheet returns structured data", async ({ page }) => {
    const fyId = await firstFyId(page);
    const bs = await apiGet<any>(page, `/compliance/schedule-iii/balance-sheet?financial_year_id=${fyId}`);
    expect(bs.financial_year).toBeTruthy();
    expect(bs.part_i).toBeTruthy();
    expect(bs.part_ii).toBeTruthy();
    expect(typeof bs.total_assets).toBe("string");
    expect(typeof bs.total_equity_liabilities).toBe("string");
  });

  test("Ind-AS profit & loss returns structured data", async ({ page }) => {
    const fyId = await firstFyId(page);
    const pl = await apiGet<any>(page, `/compliance/indas/profit-loss?financial_year_id=${fyId}`);
    expect(pl.financial_year).toBeTruthy();
    expect(typeof pl.total_income).toBe("string");
    expect(typeof pl.net_profit).toBe("string");
  });

  test("Income tax computes under new regime", async ({ page }) => {
    const fyId = await firstFyId(page);
    const it = await apiGet<any>(page, `/compliance/income-tax/compute?financial_year_id=${fyId}&regime=new`);
    expect(it.regime).toBe("new");
    expect(typeof it.taxable_income).toBe("string");
    expect(typeof it.total_tax).toBe("string");
    expect(Array.isArray(it.notes)).toBe(true);
  });

  test("Income tax computes under old regime", async ({ page }) => {
    const fyId = await firstFyId(page);
    const it = await apiGet<any>(page, `/compliance/income-tax/compute?financial_year_id=${fyId}&regime=old`);
    expect(it.regime).toBe("old");
    expect(typeof it.total_tax).toBe("string");
  });

  test("Income tax regime election can be set", async ({ page }) => {
    const fys = await apiGet<Array<{ name: string }>>(page, "/coa/financial-years");
    const fyName = fys[0].name;
    const res = await page.evaluate(async (fyName: string) => {
      const token = localStorage.getItem("zledger.token");
      let companyId = localStorage.getItem("zledger.companyId") || "";
      if (!companyId) {
        const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
        companyId = me?.companies?.[0]?.id ?? "";
      }
      const r = await fetch("/api/compliance/income-tax/regime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Company-Id": companyId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regime: "new", financial_year: fyName }),
      });
      return r.status;
    }, fyName);
    expect(res).toBe(200);
  });

  test("ICAI NCE statements return structured data", async ({ page }) => {
    const fyId = await firstFyId(page);
    const nce = await apiGet<any>(page, `/compliance/icai-nce?financial_year_id=${fyId}`);
    expect(nce.balance_sheet).toBeTruthy();
    expect(nce.profit_and_loss).toBeTruthy();
    expect(nce.notes).toBeTruthy();
  });

  test("GST compliance status returns per-return status", async ({ page }) => {
    const fyId = await firstFyId(page);
    const status = await apiGet<any>(page, `/compliance/gst-status?financial_year_id=${fyId}`);
    expect(status.financial_year).toBeTruthy();
    expect(status.returns).toBeTruthy();
  });

  test("Schedule III exports as PDF and XLSX", async ({ page }) => {
    const fyId = await firstFyId(page);
    for (const fmt of ["pdf", "xlsx"]) {
      const ok = await page.evaluate(async (args: { fyId: string; fmt: string }) => {
        const token = localStorage.getItem("zledger.token");
        let companyId = localStorage.getItem("zledger.companyId") || "";
        if (!companyId) {
          const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
          companyId = me?.companies?.[0]?.id ?? "";
        }
        const r = await fetch(
          `/api/compliance/schedule-iii/balance-sheet/${args.fmt}?financial_year_id=${args.fyId}`,
          { headers: { Authorization: `Bearer ${token}`, "X-Company-Id": companyId } },
        );
        return r.ok;
      }, { fyId, fmt });
      expect(ok).toBe(true);
    }
  });

  test("Income tax exports as PDF and XLSX", async ({ page }) => {
    const fyId = await firstFyId(page);
    for (const fmt of ["pdf", "xlsx"]) {
      const ok = await page.evaluate(async (args: { fyId: string; fmt: string }) => {
        const token = localStorage.getItem("zledger.token");
        let companyId = localStorage.getItem("zledger.companyId") || "";
        if (!companyId) {
          const me = await (await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })).json();
          companyId = me?.companies?.[0]?.id ?? "";
        }
        const r = await fetch(
          `/api/compliance/income-tax/${args.fmt}?financial_year_id=${args.fyId}&regime=new`,
          { headers: { Authorization: `Bearer ${token}`, "X-Company-Id": companyId } },
        );
        return r.ok;
      }, { fyId, fmt });
      expect(ok).toBe(true);
    }
  });
});
