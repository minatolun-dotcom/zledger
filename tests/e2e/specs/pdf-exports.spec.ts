import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "../helpers/login";
import { downloadAndParsePdf, apiGet } from "../helpers/pdf";
import { COMPANY } from "../helpers/fixtures";

test.describe("PDF Export Validation", () => {
  let fyId = "";

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await loginAsAdmin(page);
    const fys = await apiGet<Array<{ id: string }>>(page, "/coa/financial-years");
    fyId = fys[0].id;
    await page.close();
  });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  // ─── Report PDFs (need financial_year_id) ─────────────────────────────

  test("Trial Balance PDF — valid format, company header, table headers", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/trial-balance/pdf?financial_year_id=${fyId}`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Trial Balance");
    expect(pdf.text).toContain("Ledger");
    expect(pdf.text).toContain("Debit");
    expect(pdf.text).toContain("Credit");
    expect(pdf.text).toContain("TOTAL");
  });

  test("Profit & Loss PDF — valid format, income/expense sections", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/profit-and-loss/pdf?financial_year_id=${fyId}`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Profit");
    expect(pdf.text).toContain("Loss");
    expect(pdf.text).toContain("Income");
    expect(pdf.text).toContain("Expenses");
  });

  test("Balance Sheet PDF — valid format, assets/liabilities sections", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/balance-sheet/pdf?financial_year_id=${fyId}`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Balance Sheet");
    expect(pdf.text).toContain("Assets");
    expect(pdf.text).toContain("Liabilities");
  });

  test("Cash Flow PDF — valid format, activity categories", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/cash-flow/pdf?financial_year_id=${fyId}`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Cash Flow");
    expect(pdf.text).toContain("Operating");
    expect(pdf.text).toContain("Investing");
  });

  test("Aging PDF — valid format, party names", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/aging/pdf?financial_year_id=${fyId}&type=receivable`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Aging");
    expect(pdf.text).toContain("Party");
    expect(pdf.text).toContain("Total");
  });

  test("Outstanding PDF — valid format, debtor/creditor data", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/outstanding/pdf?financial_year_id=${fyId}`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Outstanding");
    expect(pdf.text).toContain("Party");
  });

  test("Register PDF — valid format, voucher entries", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/register/pdf?financial_year_id=${fyId}&voucher_type=sales`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Register");
    expect(pdf.text).toContain("Date");
    expect(pdf.text).toContain("Debit");
    expect(pdf.text).toContain("Credit");
  });

  test("TDS Summary PDF — valid format", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, `/reports/tds-tcs-summary/pdf?financial_year_id=${fyId}&tds_tcs_type=tds`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("TDS");
    expect(pdf.text).toContain("Party");
  });

  // ─── Stock PDFs (no FY needed) ───────────────────────────────────────

  test("Stock Summary PDF — valid format, item names", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, "/reports/stock-summary/pdf");
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Stock Summary");
    expect(pdf.text).toContain("Item");
  });

  test("Stock Movement PDF — valid format, item data", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, "/reports/stock-movement/pdf");
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Stock Movement");
    expect(pdf.text).toContain("Item");
  });

  test("Stock Ageing PDF — valid format, ageing buckets", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, "/reports/stock-ageing/pdf");
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Stock Ageing");
    expect(pdf.text).toContain("Item");
  });

  // ─── Ledger Transactions PDF (needs ledger_id + FY) ──────────────────

  test("Ledger Transactions PDF — valid format, ledger header", async ({ page }) => {
    // Get a ledger ID from the trial balance page
    const ledgers = await apiGet<Array<{ id: string; ledger_name: string }>>(
      page, `/coa/ledgers`
    );
    const ledgerId = ledgers[0].id;

    const pdf = await downloadAndParsePdf(
      page,
      `/reports/ledger-transactions/pdf?ledger_id=${ledgerId}&financial_year_id=${fyId}`
    );
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Debit");
    expect(pdf.text).toContain("Credit");
  });

  // ─── Voucher PDF ─────────────────────────────────────────────────────

  test("Voucher PDF — valid format, party info, grand total", async ({ page }) => {
    const vouchers = await apiGet<Array<{ id: string; voucher_type: string; voucher_number: string }>>(
      page, "/vouchers"
    );
    const voucher = vouchers[0];

    const pdf = await downloadAndParsePdf(page, `/vouchers/${voucher.id}/pdf`);
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain(COMPANY.name);
    expect(pdf.text).toContain("Grand Total");
  });

  // ─── DayBook PDF ─────────────────────────────────────────────────────

  test("DayBook PDF — valid format, voucher entries", async ({ page }) => {
    const pdf = await downloadAndParsePdf(page, "/reports/daybook/pdf");
    expect(pdf.numPages).toBeGreaterThanOrEqual(1);
    expect(pdf.text).toContain("Day Book");
    expect(pdf.text).toContain("TOTAL");
  });
});
