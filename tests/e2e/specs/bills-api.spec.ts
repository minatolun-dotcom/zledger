/**
 * Bill-wise Accounting E2E Tests
 * 
 * Tests the complete bill-wise workflow:
 * 1. Auto-bill creation from Sales/Purchase invoices
 * 2. Outstanding bills API
 * 3. Bill settlement (Receipt/Payment allocation)
 * 4. Over-allocation prevention
 * 5. Partial payment handling
 * 6. Party statement generation
 * 7. Aging calculation
 */

import { test, expect, type APIRequestContext } from "@playwright/test";
import { ADMIN } from "../helpers/fixtures";

const API = "http://localhost:9090/api";

async function loginAs(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  return (await res.json()).access_token as string;
}

async function adminToken(request: APIRequestContext) {
  return loginAs(request, ADMIN.email, ADMIN.password);
}

async function api(request: APIRequestContext, method: string, path: string, token?: string | null, companyId?: string | null, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (companyId) headers["X-Company-Id"] = companyId;
  const opts: any = { headers };
  if (body !== undefined) opts.data = body;
  let res;
  switch (method) {
    case "GET": res = await request.get(`${API}${path}`, opts); break;
    case "POST": res = await request.post(`${API}${path}`, opts); break;
    case "PATCH": res = await request.patch(`${API}${path}`, opts); break;
    case "DELETE": res = await request.delete(`${API}${path}`, opts); break;
    default: throw new Error(`Unknown method: ${method}`);
  }
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status(), body: json };
}

async function getCompanyId(request: APIRequestContext, token: string) {
  const r = await api(request, "GET", "/auth/me", token);
  return r.body.companies?.[0]?.id;
}

async function getLedgerIds(request: APIRequestContext, token: string, cid: string, names: string[]): Promise<Map<string, string>> {
  const r = await api(request, "GET", "/coa/ledgers", token, cid);
  const map = new Map<string, string>();
  if (r.status === 200 && Array.isArray(r.body)) {
    for (const ledger of r.body) {
      if (names.includes(ledger.name)) map.set(ledger.name, ledger.id);
    }
  }
  return map;
}

async function getParties(request: APIRequestContext, token: string, cid: string, type: "customer" | "supplier"): Promise<any[]> {
  const r = await api(request, "GET", `/parties?party_type=${type}`, token, cid);
  return r.status === 200 ? (r.body || []) : [];
}

async function getStockItems(request: APIRequestContext, token: string, cid: string): Promise<any[]> {
  const r = await api(request, "GET", "/stock-items", token, cid);
  return r.status === 200 ? (r.body || []) : [];
}

async function getFinancialYears(request: APIRequestContext, token: string, cid: string): Promise<any[]> {
  const r = await api(request, "GET", "/accounting/financial-years", token, cid);
  return r.status === 200 ? (r.body || []) : [];
}

test.describe("API: Bill-wise Accounting", () => {
  let token: string;
  let cid: string;
  let ledgerIds: Map<string, string>;
  let customer: any;
  let supplier: any;
  let stockItem: any;
  let fyId: string;

  test.beforeAll(async ({ request }) => {
    token = await adminToken(request);
    cid = await getCompanyId(request, token);
    
    // Get ledger IDs
    ledgerIds = await getLedgerIds(request, token, cid, ["Sales", "Purchase", "CGST", "SGST", "IGST", "Cash"]);
    
    // Get parties
    const customers = await getParties(request, token, cid, "customer");
    const suppliers = await getParties(request, token, cid, "supplier");
    customer = customers[0];
    supplier = suppliers[0];
    
    // Get stock items
    const items = await getStockItems(request, token, cid);
    stockItem = items[0];
    
    // Get active financial year
    const fys = await getFinancialYears(request, token, cid);
    const activeFy = fys.find((f: any) => f.is_active);
    fyId = activeFy?.id;
    
    expect(customer).toBeTruthy();
    expect(supplier).toBeTruthy();
    expect(stockItem).toBeTruthy();
    expect(fyId).toBeTruthy();
  });

  test("Auto-create bill from Sales invoice", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    
    // Get customer's ledger
    const customerLedgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const customerLedger = customerLedgers.body.find((l: any) => l.party_id === customer.id);
    expect(customerLedger).toBeTruthy();
    
    // Create Sales invoice
    const salesPayload = {
      company_id: cid,
      financial_year_id: fyId,
      voucher_type: "sales",
      voucher_date: today,
      narration: "E2E Test Sales Invoice for Bill Creation",
      party_id: customer.id,
      lines: [
        {
          ledger_id: customerLedger.id,
          debit: 1180.0,
          credit: 0.0
        },
        {
          ledger_id: ledgerIds.get("Sales"),
          debit: 0.0,
          credit: 1000.0,
          stock_item_id: stockItem.id,
          quantity: 10.0,
          rate: 100.0
        },
        {
          ledger_id: ledgerIds.get("CGST"),
          debit: 0.0,
          credit: 90.0
        },
        {
          ledger_id: ledgerIds.get("SGST"),
          debit: 0.0,
          credit: 90.0
        }
      ]
    };
    
    const voucherRes = await api(request, "POST", "/vouchers", token, cid, salesPayload);
    expect(voucherRes.status).toBe(201);
    expect(voucherRes.body.id).toBeTruthy();
    expect(voucherRes.body.grand_total).toBe(1180);
    
    const voucherId = voucherRes.body.id;
    
    // Check if bill was auto-created
    const billsRes = await api(request, "GET", `/bills/all?party_id=${customer.id}`, token, cid);
    expect(billsRes.status).toBe(200);
    
    const billsArray = Array.isArray(billsRes.body) ? billsRes.body : [];
    const createdBill = billsArray.find((b: any) => b.voucher_id === voucherId);
    
    expect(createdBill).toBeTruthy();
    expect(createdBill.original_amount).toBe(1180);
    expect(createdBill.outstanding_amount).toBe(1180);
    expect(createdBill.status).toBe("open");
    expect(createdBill.bill_type).toBe("new_ref");
    
    console.log(`✅ Auto-created bill: ${createdBill.bill_number} (₹${createdBill.original_amount})`);
  });

  test("Auto-create bill from Purchase invoice", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    
    // Get supplier's ledger
    const supplierLedgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const supplierLedger = supplierLedgers.body.find((l: any) => l.party_id === supplier.id);
    expect(supplierLedger).toBeTruthy();
    
    // Create Purchase invoice
    const purchasePayload = {
      company_id: cid,
      financial_year_id: fyId,
      voucher_type: "purchase",
      voucher_date: today,
      narration: "E2E Test Purchase Invoice for Bill Creation",
      party_id: supplier.id,
      lines: [
        {
          ledger_id: supplierLedger.id,
          debit: 0.0,
          credit: 1180.0
        },
        {
          ledger_id: ledgerIds.get("Purchase"),
          debit: 1000.0,
          credit: 0.0,
          stock_item_id: stockItem.id,
          quantity: 10.0,
          rate: 100.0
        },
        {
          ledger_id: ledgerIds.get("CGST"),
          debit: 90.0,
          credit: 0.0
        },
        {
          ledger_id: ledgerIds.get("SGST"),
          debit: 90.0,
          credit: 0.0
        }
      ]
    };
    
    const voucherRes = await api(request, "POST", "/vouchers", token, cid, purchasePayload);
    expect(voucherRes.status).toBe(201);
    
    const voucherId = voucherRes.body.id;
    
    // Check if bill was auto-created
    const billsRes = await api(request, "GET", `/bills/all?party_id=${supplier.id}`, token, cid);
    expect(billsRes.status).toBe(200);
    
    const billsArray = Array.isArray(billsRes.body) ? billsRes.body : [];
    const createdBill = billsArray.find((b: any) => b.voucher_id === voucherId);
    
    expect(createdBill).toBeTruthy();
    expect(createdBill.original_amount).toBe(1180);
    expect(createdBill.outstanding_amount).toBe(1180);
    expect(createdBill.status).toBe("open");
    
    console.log(`✅ Auto-created purchase bill: ${createdBill.bill_number} (₹${createdBill.original_amount})`);
  });

  test("Get outstanding bills for customer", async ({ request }) => {
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, token, cid);
    
    expect(outstandingRes.status).toBe(200);
    expect(outstandingRes.body.party_id).toBe(customer.id);
    expect(Array.isArray(outstandingRes.body.bills)).toBe(true);
    expect(outstandingRes.body.total_outstanding).toBeGreaterThan(0);
    
    console.log(`✅ Outstanding bills for ${outstandingRes.body.party_name}: ₹${outstandingRes.body.total_outstanding}`);
  });

  test("Get outstanding bills for supplier", async ({ request }) => {
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${supplier.id}?voucher_type=purchase`, token, cid);
    
    expect(outstandingRes.status).toBe(200);
    expect(outstandingRes.body.party_id).toBe(supplier.id);
    expect(Array.isArray(outstandingRes.body.bills)).toBe(true);
    
    console.log(`✅ Outstanding bills for ${outstandingRes.body.party_name}: ₹${outstandingRes.body.total_outstanding}`);
  });

  test("Settle bill with Receipt (partial payment)", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    
    // Get outstanding bills
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, token, cid);
    const bills = outstandingRes.body.bills || [];
    
    if (bills.length === 0) {
      console.log("⚠️ No outstanding bills to settle, skipping test");
      return;
    }
    
    const bill = bills[0];
    const partialAmount = Math.min(500, bill.outstanding_amount / 2);
    
    // Create Receipt with bill allocation
    const customerLedgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const customerLedger = customerLedgers.body.find((l: any) => l.party_id === customer.id);
    
    const receiptPayload = {
      company_id: cid,
      financial_year_id: fyId,
      voucher_type: "receipt",
      voucher_date: today,
      narration: "E2E Test Partial Receipt",
      party_id: customer.id,
      lines: [
        {
          ledger_id: ledgerIds.get("Cash"),
          debit: partialAmount,
          credit: 0.0
        },
        {
          ledger_id: customerLedger.id,
          debit: 0.0,
          credit: partialAmount
        }
      ],
      bill_allocations: [
        {
          bill_reference_id: bill.id,
          amount: partialAmount
        }
      ]
    };
    
    const receiptRes = await api(request, "POST", "/vouchers", token, cid, receiptPayload);
    expect(receiptRes.status).toBe(201);
    
    // Verify bill status updated
    const updatedBillRes = await api(request, "GET", `/bills/${bill.id}`, token, cid);
    expect(updatedBillRes.status).toBe(200);
    expect(updatedBillRes.body.paid_amount).toBeGreaterThan(0);
    expect(updatedBillRes.body.outstanding_amount).toBeLessThan(bill.original_amount);
    expect(updatedBillRes.body.status).toBe("partial");
    
    console.log(`✅ Partial payment: Paid ₹${partialAmount}, Outstanding: ₹${updatedBillRes.body.outstanding_amount}`);
  });

  test("Prevent over-allocation (validation)", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    
    // Get outstanding bills
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, token, cid);
    const bills = outstandingRes.body.bills || [];
    
    if (bills.length === 0) {
      console.log("⚠️ No outstanding bills, skipping over-allocation test");
      return;
    }
    
    const bill = bills[0];
    const overAmount = bill.outstanding_amount * 2; // Try to allocate double
    
    const customerLedgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const customerLedger = customerLedgers.body.find((l: any) => l.party_id === customer.id);
    
    const receiptPayload = {
      company_id: cid,
      financial_year_id: fyId,
      voucher_type: "receipt",
      voucher_date: today,
      narration: "E2E Test Over-Allocation",
      party_id: customer.id,
      lines: [
        {
          ledger_id: ledgerIds.get("Cash"),
          debit: overAmount,
          credit: 0.0
        },
        {
          ledger_id: customerLedger.id,
          debit: 0.0,
          credit: overAmount
        }
      ],
      bill_allocations: [
        {
          bill_reference_id: bill.id,
          amount: overAmount // Over-allocation
        }
      ]
    };
    
    const receiptRes = await api(request, "POST", "/vouchers", token, cid, receiptPayload);
    
    // Should fail with 400 Bad Request
    expect(receiptRes.status).toBe(400);
    expect(receiptRes.body.detail).toContain("exceeds");
    
    console.log(`✅ Over-allocation prevented: ${receiptRes.body.detail}`);
  });

  test("Generate party statement", async ({ request }) => {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
    const endDate = today.toISOString().split("T")[0];
    
    const statementRes = await api(request, "GET", `/bills/statement/${customer.id}?start_date=${startDate}&end_date=${endDate}`, token, cid);
    
    expect(statementRes.status).toBe(200);
    expect(statementRes.body.party_id).toBe(customer.id);
    expect(statementRes.body.party_name).toBeTruthy();
    expect(Array.isArray(statementRes.body.transactions)).toBe(true);
    expect(typeof statementRes.body.opening_balance).toBe("number");
    expect(typeof statementRes.body.closing_balance).toBe("number");
    
    console.log(`✅ Statement generated: ${statementRes.body.party_name}`);
    console.log(`   Opening: ₹${statementRes.body.opening_balance}, Closing: ₹${statementRes.body.closing_balance}`);
    console.log(`   Transactions: ${statementRes.body.transactions.length}`);
  });

  test("Aging calculation", async ({ request }) => {
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, token, cid);
    
    expect(outstandingRes.status).toBe(200);
    const bills = outstandingRes.body.bills || [];
    
    for (const bill of bills) {
      expect(bill).toHaveProperty("days_overdue");
      expect(bill).toHaveProperty("aging_bucket");
      expect(typeof bill.days_overdue).toBe("number");
      expect(["current", "1-30", "31-60", "61-90", "90+"]).toContain(bill.aging_bucket);
    }
    
    console.log(`✅ Aging calculated for ${bills.length} bills`);
  });

  test("Full settlement (bill status = paid)", async ({ request }) => {
    const today = new Date().toISOString().split("T")[0];
    
    // Get outstanding bills
    const outstandingRes = await api(request, "GET", `/bills/outstanding/${customer.id}?voucher_type=sales`, token, cid);
    const bills = outstandingRes.body.bills || [];
    
    if (bills.length === 0) {
      console.log("⚠️ No outstanding bills to fully settle, skipping test");
      return;
    }
    
    const bill = bills[bills.length - 1]; // Take the last one
    const fullAmount = bill.outstanding_amount;
    
    const customerLedgers = await api(request, "GET", "/coa/ledgers", token, cid);
    const customerLedger = customerLedgers.body.find((l: any) => l.party_id === customer.id);
    
    const receiptPayload = {
      company_id: cid,
      financial_year_id: fyId,
      voucher_type: "receipt",
      voucher_date: today,
      narration: "E2E Test Full Settlement",
      party_id: customer.id,
      lines: [
        {
          ledger_id: ledgerIds.get("Cash"),
          debit: fullAmount,
          credit: 0.0
        },
        {
          ledger_id: customerLedger.id,
          debit: 0.0,
          credit: fullAmount
        }
      ],
      bill_allocations: [
        {
          bill_reference_id: bill.id,
          amount: fullAmount
        }
      ]
    };
    
    const receiptRes = await api(request, "POST", "/vouchers", token, cid, receiptPayload);
    expect(receiptRes.status).toBe(201);
    
    // Verify bill status = paid
    const updatedBillRes = await api(request, "GET", `/bills/${bill.id}`, token, cid);
    expect(updatedBillRes.status).toBe(200);
    expect(updatedBillRes.body.outstanding_amount).toBe(0);
    expect(updatedBillRes.body.status).toBe("paid");
    
    console.log(`✅ Full settlement: Bill ${updatedBillRes.body.bill_number} status = paid`);
  });
});

// Cleanup test data after all tests
test.afterAll(async () => {
  console.log("\n🧹 Test data cleanup is handled by existing cleanup command in AGENTS.md");
});
