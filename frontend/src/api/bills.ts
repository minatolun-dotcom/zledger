/**
 * Bill-wise Accounting API Client
 * 
 * Endpoints for outstanding bills, settlement, and party statements.
 */

import { api } from "./client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OutstandingBill {
  bill_reference_id: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  invoice_voucher_number: string;
  invoice_date: string;
  original_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  days_overdue: number;
  aging_bucket: string;
}

export interface OutstandingBillsResponse {
  party_id: string;
  party_name: string;
  bills: OutstandingBill[];
  total_outstanding: number;
  oldest_bill_date: string | null;
  max_days_overdue: number;
}

export interface BillSettlementLine {
  bill_reference_id: string;
  amount: number;
  remarks?: string;
}

export interface BillSettlementRequest {
  payment_voucher_id: string;
  settlement_date: string;
  settlements: BillSettlementLine[];
}

export interface BillSettlementResult {
  payment_allocation_id: string;
  bill_reference_id: string;
  amount: number;
  remaining_outstanding: number;
}

export interface StatementLine {
  date: string;
  voucher_type: string;
  voucher_number: string;
  bill_number: string | null;
  debit: number;
  credit: number;
  balance: number;
  remarks: string | null;
}

export interface PartyStatementResponse {
  party_id: string;
  party_name: string;
  party_type: string;
  start_date: string;
  end_date: string;
  opening_balance: number;
  opening_balance_type: string;
  transactions: StatementLine[];
  closing_balance: number;
  closing_balance_type: string;
  total_debit: number;
  total_credit: number;
}

export interface NoteInfo {
  note_id: string;
  voucher_number: string;
  voucher_date: string;
  grand_total: number;
  applied_amount: number;
  unapplied_amount: number;
}

export type CreditNoteInfo = NoteInfo;

export interface PartyCreditNotesResponse {
  party_id: string;
  credit_notes: CreditNoteInfo[];
}

export interface PartyDebitNotesResponse {
  party_id: string;
  debit_notes: NoteInfo[];
}

export interface BillAdjustResult {
  bill_reference_id: string;
  applied_amount: number;
  adjusted_amount: number;
  outstanding_amount: number;
  status: string;
}

export interface BillReference {
  id: string;
  company_id: string;
  invoice_voucher_id: string;
  /** "sales" or "purchase" — the invoice's side, for per-bill classification */
  voucher_type?: string | null;
  reference_type: string;
  bill_number: string;
  bill_date: string;
  due_date: string | null;
  original_amount: number;
  adjusted_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  status: string;
  party_id: string | null;
  party_name: string | null;
  is_advance: boolean;
  days_overdue?: number;
  aging_bucket?: string;
  created_at: string | null;
  updated_at: string | null;
}

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Get outstanding bills for a party (customer or supplier).
 * Used in Receipt/Payment forms for bill selection.
 */
export async function getOutstandingBills(
  partyId: string,
  voucherType: "sales" | "purchase"
): Promise<OutstandingBillsResponse> {
  return api.get<OutstandingBillsResponse>(`/bills/outstanding/${partyId}?voucher_type=${voucherType}`);
}

/**
 * Settle one or more outstanding bills with a payment/receipt voucher.
 */
export async function settleBills(
  request: BillSettlementRequest
): Promise<BillSettlementResult[]> {
  return api.post<BillSettlementResult[]>("/bills/settle", request);
}

/**
 * Generate customer or supplier statement for a date range.
 */
export async function getPartyStatement(
  partyId: string,
  startDate: string,
  endDate: string
): Promise<PartyStatementResponse> {
  return api.get<PartyStatementResponse>(`/bills/statement/${partyId}?start_date=${startDate}&end_date=${endDate}`);
}

/**
 * Adjust invoice bill with credit note (amount optional — capped to outstanding).
 */
export async function adjustBillWithCreditNote(
  creditNoteId: string,
  invoiceBillId: string,
  amount?: number
): Promise<BillAdjustResult> {
  const qs = amount !== undefined ? `?amount=${amount}` : "";
  return api.post(`/bills/credit-note/${creditNoteId}/adjust/${invoiceBillId}${qs}`, {});
}

/**
 * Adjust purchase bill with debit note (amount optional — capped to outstanding).
 */
export async function adjustBillWithDebitNote(
  debitNoteId: string,
  purchaseBillId: string,
  amount?: number
): Promise<BillAdjustResult> {
  const qs = amount !== undefined ? `?amount=${amount}` : "";
  return api.post(`/bills/debit-note/${debitNoteId}/adjust/${purchaseBillId}${qs}`, {});
}

/**
 * Unapplied credit notes for a party — candidates for bill adjustment.
 */
export async function getPartyCreditNotes(partyId: string): Promise<PartyCreditNotesResponse> {
  return api.get<PartyCreditNotesResponse>(`/bills/credit-notes/${partyId}`);
}

/**
 * Unapplied debit notes for a party — candidates for purchase-bill adjustment.
 */
export async function getPartyDebitNotes(partyId: string): Promise<PartyDebitNotesResponse> {
  return api.get<PartyDebitNotesResponse>(`/bills/debit-notes/${partyId}`);
}

/**
 * List all bill references with optional filters.
 */
export async function listBillReferences(params?: {
  party_id?: string;
  status?: "open" | "partial" | "paid" | "cancelled";
  limit?: number;
}): Promise<BillReference[]> {
  const query = new URLSearchParams();
  if (params?.party_id) query.set("party_id", params.party_id);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", params.limit.toString());
  return api.get<BillReference[]>(`/bills/all?${query.toString()}`);
}
/**
 * Get single bill reference by ID.
 */
export async function getBillReference(billId: string): Promise<BillReference> {
  return api.get<BillReference>(`/bills/${billId}`);
}
