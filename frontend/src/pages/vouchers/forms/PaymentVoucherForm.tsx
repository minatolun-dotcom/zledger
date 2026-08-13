import { useEffect, useMemo, useState, useCallback } from "react";
import { api } from "../../../api/client";
import { useToastStore } from "../../../store/toast";
import { todayIso } from "../../../utils/dateUtils";
import type { Ledger, Party, AccountGroup, VoucherLine, VoucherSummaryData } from "../types";
import { emptyLedgerLine, getLedgerGroupType } from "../types";
import { partyByLedgerMap, ledgerOptionLabel } from "../shared/ledgerUtils";
import DateInput from "../../../components/DateInput";
import MasterSelector from "../../../components/master/MasterSelector";
import Select from "../../../components/Select";
import PayableAllocationTable, { type PayableAllocation } from "../shared/PayableAllocationTable";
import { useVoucherKeyboard, focusFirstField } from "../hooks/useVoucherKeyboard";
import VoucherTemplateModal, { showTemplateModal } from "../../../components/VoucherTemplateModal";
import VoucherFooter from "../shared/VoucherFooter";
import { validateDateInFy, findFyForDate } from "../shared/fyValidation";

interface PaymentVoucherFormProps {
  ledgers: Ledger[];
  parties: Party[];
  accountGroups: AccountGroup[];
  onSubmit: (payload: any) => Promise<void>;
  isSubmitting?: boolean;
  error?: string;
  setError?: (msg: string) => void;
  onQuickCreate?: (entityKey: string, item: unknown) => void;
  editingVoucher?: any;
  onUpdate?: (id: string, payload: any) => Promise<void>;
  onFlowChange?: (data: any) => void;
  formScopeRef?: React.RefObject<HTMLDivElement | null>;
  financialYears?: any[];
  setActiveFy?: (id: string | null) => void;
  onSummary?: (data: VoucherSummaryData) => void;
  initialData?: any;
}

const PAYMENT_MODES = ["Cash", "Cheque", "Bank Transfer", "UPI", "RTGS", "NEFT", "IMPS", "DD", "Card"] as const;
const PAID_FROM_GROUPS = ["cash", "bank"];

export default function PaymentVoucherForm({
  ledgers,
  parties,
  accountGroups,
  onSubmit,
  isSubmitting = false,
  error,
  setError,
  onQuickCreate,
  editingVoucher,
  onUpdate,
  onFlowChange,
  formScopeRef,
  financialYears = [],
  setActiveFy,
  onSummary,
  initialData,
}: PaymentVoucherFormProps) {
  const toast = useToastStore();

  // ── Form State ──────────────────────────────────────────────────────
  const [date, setDate] = useState(initialData?.voucher_date || todayIso());
  const [reference, setReference] = useState(initialData?.reference || "");
  const [narration, setNarration] = useState(initialData?.narration || "");

  // Account (cash/bank) — the source of funds
  const [accountId, setAccountId] = useState("");

  // Particulars — multiple ledger lines (DEBIT side)
  const [lines, setLines] = useState<VoucherLine[]>([
    emptyLedgerLine(),
    emptyLedgerLine(),
  ]);

  // Payment details
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  // ── Pre-fill from initialData (Create Similar) ─────────────────────
  // similarData arrives AFTER this form mounts (the ?similar= fetch is
  // async), so useState initializers alone are not enough — react to it.
  useEffect(() => {
    if (!initialData || editingVoucher) return;
    if (initialData.narration) setNarration(initialData.narration);
    // source account (credit side of the original) + first payee line
    if (initialData.fromLedgerId) setAccountId(initialData.fromLedgerId);
    if (initialData.toLedgerId) {
      setLines([{ ...emptyLedgerLine(), ledger_id: initialData.toLedgerId }, emptyLedgerLine()]);
    }
  }, [initialData]);

  // ── Allocation callback (advance amount tracked for summary) ─────
  const [_advanceAmount, setAdvanceAmount] = useState(0);
  const handleAllocationChange = useCallback(
    (_allocs: PayableAllocation[], adv: number) => {
      setAdvanceAmount(adv);
    },
    []
  );

  // Voucher number
  const [suggestedVoucherNumber, setSuggestedVoucherNumber] = useState("");
  const [customVoucherNumber, setCustomVoucherNumber] = useState("");
  const [localError, setLocalError] = useState("");

  // ── Party resolution from particulars ──────────────────────────────
  const partyByLedger = useMemo(() => partyByLedgerMap(parties), [parties]);

  // ── Group code map for ledger type detection ───────────────────────
  const groupCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of accountGroups) {
      if (g.system_code) map.set(g.id, g.system_code);
    }
    return map;
  }, [accountGroups]);

  const ledgerGroupType = (ledger: Ledger | undefined) =>
    getLedgerGroupType(ledger ? groupCodeMap.get(ledger.group_id) : null);

  // ── Filter ledgers for Account selector ────────────────────────────
  const accountLedgers = useMemo(() => {
    return ledgers.filter((l) => PAID_FROM_GROUPS.includes(ledgerGroupType(l)));
  }, [ledgers, groupCodeMap]);

  // All ledgers for particulars (excluding the selected account)
  const particularLedgers = useMemo(() => {
    return ledgers.filter((l) => l.id !== accountId);
  }, [ledgers, accountId]);

  // ── Compute totals ─────────────────────────────────────────────────
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalLines = lines.filter((l) => l.ledger_id && Number(l.debit || 0) > 0).length;

  // Find the first sundry_debtor/creditor in particulars for bill allocation
  const allocationParty = useMemo(() => {
    for (const line of lines) {
      if (!line.ledger_id) continue;
      const ledger = ledgers.find((l) => l.id === line.ledger_id);
      const groupType = ledgerGroupType(ledger);
      if (groupType === "sundry_debtors" || groupType === "sundry_creditors") {
        return parties.find((p) => p.ledger_id === line.ledger_id) || null;
      }
    }
    return null;
  }, [lines, ledgers, groupCodeMap, parties]);

  // Sum of debits for the allocation party
  const allocationAmount = useMemo(() => {
    if (!allocationParty) return 0;
    return lines
      .filter((l) => l.ledger_id === allocationParty.ledger_id)
      .reduce((s, l) => s + Number(l.debit || 0), 0);
  }, [lines, allocationParty]);

  // ── Populate form from editing voucher ──────────────────────────
  useEffect(() => {
    if (editingVoucher) {
      setDate(editingVoucher.voucher_date);
      setNarration(editingVoucher.narration || "");
      setReference(editingVoucher.reference || "");
      setPaymentMode(editingVoucher.payment_mode || "Cash");
      setReferenceNumber(editingVoucher.reference || "");
      setSuggestedVoucherNumber(editingVoucher.voucher_number || "");
      setCustomVoucherNumber("");

      // Reconstruct lines: the credit line is the Account, debit lines are particulars
      const editLines: VoucherLine[] = editingVoucher.lines || [];
      const creditLine = editLines.find((l: any) => l.credit > 0);
      const debitLines = editLines.filter((l: any) => l.debit > 0);

      setAccountId(creditLine?.ledger_id || "");
      if (debitLines.length > 0) {
        setLines(
          debitLines.map((l: any) => ({
            ...emptyLedgerLine(),
            ledger_id: l.ledger_id,
            debit: l.debit,
          }))
        );
      } else {
        setLines([emptyLedgerLine(), emptyLedgerLine()]);
      }
    }
  }, [editingVoucher]);

  // ── Fetch suggested voucher number ─────────────────────────────────
  useEffect(() => {
    if (!editingVoucher) {
      const fyId = localStorage.getItem("zledger.fyId");
      if (fyId) {
        api
          .get<{ next_number: string }>(
            `/vouchers/next-number?voucher_type=payment&financial_year_id=${fyId}`
          )
          .then((res) => setSuggestedVoucherNumber(res.next_number))
          .catch((err) => {
            console.error("Failed to fetch voucher number:", err);
          });
      }
    }
  }, [editingVoucher]);

  // ── FY validation ──────────────────────────────────────────────────
  useEffect(() => {
    if (financialYears.length === 0) return;
    const fyError = validateDateInFy(financialYears, date);
    if (fyError) {
      setLocalError(fyError);
    } else {
      setLocalError("");
      const fy = findFyForDate(financialYears, date);
      if (fy && setActiveFy) setActiveFy(fy.id);
    }
  }, [date, financialYears, setActiveFy]);

  // ── Summary callback ───────────────────────────────────────────────
  useEffect(() => {
    if (!onSummary) return;
    onSummary({
      itemCount: totalLines,
      subtotal: totalDebit,
      discountTotal: 0,
      taxableAmount: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      roundOff: null,
      netAmount: totalDebit,
      partyId: allocationParty?.id || "",
      fromLedgerId: accountId,
      toLedgerId: "",
      amount: totalDebit,
      totalDebit,
      totalCredit: totalDebit,
    });
  }, [totalDebit, totalLines, allocationParty, accountId, onSummary]);

  // ── Flow data ──────────────────────────────────────────────────────
  useEffect(() => {
    onFlowChange?.({
      voucherType: "payment",
      fromLedgerId: accountId,
      toLedgerId: "",
      amount: totalDebit,
    });
  }, [accountId, totalDebit, onFlowChange]);

  // ── Save ───────────────────────────────────────────────────────────
  const handleSave = async (asDraft = false) => {
    setError?.("");
    setLocalError("");

    if (!accountId) {
      setError?.("Please select Account (cash/bank)");
      return;
    }

    const validLines = lines.filter(
      (l) => l.ledger_id && Number(l.debit || 0) > 0
    );
    if (validLines.length === 0) {
      setError?.("Please add at least one particular with an amount");
      return;
    }

    const fyError = validateDateInFy(financialYears, date);
    if (fyError) {
      setLocalError(fyError);
      return;
    }

    // Build payload: particulars as DEBIT, account as CREDIT
    const payloadLines = [
      // Particulars → DEBIT
      ...validLines.map((l) => ({
        ledger_id: l.ledger_id,
        debit: l.debit,
        credit: 0,
      })),
      // Account (cash/bank) → CREDIT (total of all debits)
      { ledger_id: accountId, debit: 0, credit: totalDebit },
    ];

    // Resolve party from first sundry_debtor/creditor in particulars
    const partyObj = allocationParty;

    const payload: any = {
      voucher_type: "payment",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: partyObj?.id || null,
      counterparty_gstin: partyObj?.gstin || null,
      counterparty_state_code: partyObj?.state_code || null,
      lines: payloadLines,
    };
    if (asDraft) payload.status = "draft";

    if (!editingVoucher?.id && customVoucherNumber) {
      payload.voucher_number = customVoucherNumber;
    }

    try {
      if (editingVoucher?.id && onUpdate) {
        await onUpdate(editingVoucher.id, payload);
      } else {
        await onSubmit(payload);
        // Reset form
        setDate(todayIso());
        setReference("");
        setNarration("");
        setAccountId("");
        setLines([emptyLedgerLine(), emptyLedgerLine()]);
        setPaymentMode("Cash");
        setReferenceNumber("");
        setAdvanceAmount(0);
        setCustomVoucherNumber("");
      }
    } catch (err: any) {
      setError?.(err?.message || "Failed to save payment");
    }
  };

  // ── Keyboard navigation ────────────────────────────────────────────
  const fieldOrder = ["reference", "date", "account", "narration"];
  useVoucherKeyboard({
    fieldOrder,
    onSave: handleSave,
    onReset: () => {
      setDate(todayIso());
      setReference("");
      setNarration("");
      setAccountId("");
      setLines([emptyLedgerLine(), emptyLedgerLine()]);
      setAdvanceAmount(0);
      setCustomVoucherNumber("");
      setError?.("");
      setLocalError("");
    },
    isSubmitting,
    scopeRef: formScopeRef,
  });

  useEffect(() => {
    focusFirstField(fieldOrder);
  }, []);

  // ── Save as template ───────────────────────────────────────────────
  const handleSaveAsTemplate = async (name: string, frequency: string) => {
    const validLines = lines.filter(
      (l) => l.ledger_id && Number(l.debit || 0) > 0
    );
    const templatePayload: any = {
      voucher_type: "payment",
      voucher_date: date,
      narration: narration || null,
      reference: reference || null,
      party_id: allocationParty?.id || null,
      lines: [
        ...validLines.map((l) => ({
          ledger_id: l.ledger_id,
          debit: l.debit,
          credit: 0,
        })),
        { ledger_id: accountId, debit: 0, credit: totalDebit },
      ],
    };
    try {
      await api.post("/recurring-templates", {
        name,
        voucher_type: "payment",
        frequency,
        next_run_date: new Date().toISOString().split("T")[0],
        template_payload: templatePayload,
      });
      toast.success("Template saved!");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save template");
    }
  };

  const displayError = error || localError;

  // ── Particulars table helpers ──────────────────────────────────────
  const updateLine = (i: number, field: keyof VoucherLine, val: string | number) => {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  };

  const addLine = () => setLines([...lines, emptyLedgerLine()]);

  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, idx) => idx !== i));
  };

  return (
    <div className="space-y-3" ref={formScopeRef as React.RefObject<HTMLDivElement>}>
      {/* ── Header: Date, Voucher No, Account ──────────────────────── */}
      <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
          {/* Date */}
          <div className="max-w-[160px]">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
              Date
            </label>
            <DateInput
              value={date}
              onChange={setDate}
              data-field="date"
              className="w-full"
            />
          </div>
          {/* Voucher No */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
              Voucher No.
            </label>
            <input
              type="text"
              value={customVoucherNumber}
              onChange={(e) => setCustomVoucherNumber(e.target.value)}
              placeholder={suggestedVoucherNumber || "Auto"}
              className="w-full rounded-lg border border-slate-300 dark:border-[#282832] px-3 py-1.5 text-sm bg-white dark:bg-[#0f0f16] text-slate-800 dark:text-[#f1f5f9] placeholder:text-slate-400 dark:placeholder:text-[#64748b] focus:border-brand-500 dark:focus:border-blue-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:focus:ring-blue-500/20"
              data-field="voucher_number"
            />
          </div>
          {/* Account (Paid From) */}
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
              Account (Paid From)
            </label>
            <div data-field="account">
              <MasterSelector
                entityKey="ledger"
                value={accountId}
                onChange={(id: string) => setAccountId(id)}
                options={accountLedgers.map((l) => ({
                  value: l.id,
                  label: ledgerOptionLabel(l, partyByLedger),
                }))}
                placeholder="Select cash / bank account..."
                onItemCreated={() => {
                  onQuickCreate?.("ledger", {});
                }}
              />
            </div>
          </div>
          {/* Total */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
              Total
            </label>
            <div className="px-3 py-2 text-sm font-bold text-slate-800 dark:text-[#f1f5f9] bg-slate-50 dark:bg-[#0f0f16] rounded-lg border border-slate-200 dark:border-[#282832]">
              ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Payment Mode & Reference (shown when account is selected) */}
        {accountId && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-3 pt-3 border-t border-slate-200 dark:border-[#282832]">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
                Payment Mode
              </label>
              <Select
                value={paymentMode}
                onChange={(v) => setPaymentMode(v)}
                options={PAYMENT_MODES.map((m) => ({ value: m, label: m }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
                Reference No.
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque / UTR / Ref #"
                className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-semibold text-slate-600 dark:text-[#94a3b8] mb-1">
                Notes / Reference
              </label>
              <div data-field="reference">
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Additional notes or reference"
                  className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg px-3 py-2 bg-white dark:bg-[#1a1a24]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Particulars Table ──────────────────────────────────────── */}
      {accountId && (
        <div
          className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-3"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              const t = e.target as HTMLElement;
              if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
              e.preventDefault();
              addLine();
            }
          }}
        >
          <h4 className="mb-2 text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            Particulars
          </h4>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-[#1a1a24] bg-white dark:bg-[#16161f] shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-[#12121a] sticky top-0 z-10 text-left text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-[#cbd5e1] border-b border-slate-200 dark:border-[#1a1a24]">
                  <th className="px-3 py-2 w-6">#</th>
                  <th className="px-3 py-2">Ledger</th>
                  <th className="w-40 px-3 py-2 text-right">Amount (₹)</th>
                  <th className="w-6 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr
                    key={i}
                    className="border-t border-slate-200 dark:border-[#1a1a24] hover:bg-slate-50/50 dark:hover:bg-[#1a1a24]/50"
                  >
                    <td className="px-3 py-1 text-xs text-slate-400 dark:text-[#64748b]">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1">
                      <div data-field={`ledger_${i}`}>
                        <MasterSelector
                          entityKey="ledger"
                          value={line.ledger_id}
                          onChange={(v) => updateLine(i, "ledger_id", v)}
                          options={particularLedgers.map((l) => ({
                            value: l.id,
                            label: ledgerOptionLabel(l, partyByLedger),
                          }))}
                          placeholder="Select ledger..."
                          className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none focus:ring-0"
                          createdFrom={undefined as unknown as string}
                          onItemCreated={
                            onQuickCreate
                              ? (item) => onQuickCreate("ledger", item)
                              : undefined
                          }
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1">
                      <div data-field={`debit_${i}`}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.debit || ""}
                          onChange={(e) =>
                            updateLine(i, "debit", Number(e.target.value) || 0)
                          }
                          placeholder="0.00"
                          className="w-full rounded border border-slate-200 dark:border-[#3a3a45] bg-white dark:bg-[#16161f] px-2 py-1 text-right text-sm tabular-nums focus:border-brand-500 dark:focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-blue-500/20 transition-all"
                        />
                      </div>
                    </td>
                    <td className="px-1 py-1.5 text-center">
                      {lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          title="Remove line"
                        >
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-[#333340] bg-gradient-to-r from-slate-50 to-slate-100 dark:from-[#1a1a24] dark:to-[#1e1e2a] text-sm font-bold">
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2 text-slate-700 dark:text-[#cbd5e1]">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={addLine}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 cursor-pointer font-medium inline-flex items-center gap-1"
            >
              <span className="text-sm leading-none">+</span>
              Add Particular{" "}
              <span className="text-slate-400 dark:text-[#64748b] font-normal">
                (Ctrl+Enter)
              </span>
            </button>
            <span className="text-xs text-slate-500 dark:text-[#64748b]">
              {totalLines} {totalLines === 1 ? "line" : "lines"}
            </span>
          </div>
        </div>
      )}

      {/* ── Bill Allocation + Narration ─────────────────────────────── */}
      <div className="space-y-3">
        {allocationParty && allocationParty.ledger_id && allocationAmount > 0 && (
          <PayableAllocationTable
            partyLedgerId={allocationParty.ledger_id}
            partyName={allocationParty.name}
            paymentAmount={allocationAmount}
            onAllocationChange={handleAllocationChange}
          />
        )}
        <div data-field="narration">
          <textarea
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder="Narration..."
            rows={3}
            className="w-full text-sm border border-slate-300 dark:border-[#3a3a45] rounded-lg p-2 bg-white dark:bg-[#1a1a24]"
          />
        </div>
        {/* Footer with action buttons */}
        <VoucherFooter
          subtotal={totalDebit}
          discountTotal={0}
          cgstTotal={0}
          sgstTotal={0}
          igstTotal={0}
          grandTotal={totalDebit}
          showItemTotals={false}
          roundOffTo={null}
          onRoundOffChange={() => {}}
          onSave={() => handleSave()}
          isSubmitting={isSubmitting}
          error={displayError}
          isEditing={!!editingVoucher?.id}
          onSaveAsTemplate={() =>
            showTemplateModal("payment", handleSaveAsTemplate)
          }
          onSaveAsDraft={editingVoucher?.status !== "posted" ? () => handleSave(true) : undefined}
        />
      </div>
      <VoucherTemplateModal />
    </div>
  );
}
