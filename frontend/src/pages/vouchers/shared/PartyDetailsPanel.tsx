import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { Party } from "../types";
import { INDIAN_STATES } from "../../../components/IndianStates";

interface PartyDetailsPanelProps {
  /** The selected party's ledger ID — used to look up the party */
  ledgerId: string;
  /** Full list of parties for lookup */
  parties: Party[];
  /** Party ID if already known (skip ledger lookup) */
  partyId?: string;
}

interface OutstandingData {
  balance: number;
  type: string;
}

/** Look up state name by GST code. Returns dash if not found. */
function stateName(code: string | null | undefined): string {
  if (!code) return "—";
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? code;
}

/** Place of supply label derived from state name. */
function placeOfSupply(state: string): string {
  if (state === "—") return "—";
  return state;
}

const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PartyDetailsPanel({
  ledgerId,
  parties,
  partyId,
}: PartyDetailsPanelProps) {
  // ── Resolve party ─────────────────────────────────────────────────────
  const party: Party | undefined = partyId
    ? parties.find((p) => p.id === partyId)
    : parties.find((p) => p.ledger_id === ledgerId);

  const [outstanding, setOutstanding] = useState<OutstandingData | null>(null);

  // ── Fetch outstanding balance ─────────────────────────────────────────
  useEffect(() => {
    if (!party) {
      setOutstanding(null);
      return;
    }
    let cancelled = false;

    api
      .get<unknown>(`/api/parties/${party.id}/outstanding`)
      .then((data) => {
        if (cancelled) return;
        const d = data as Record<string, unknown> | null;
        if (d && typeof d.balance === "number") {
          setOutstanding({
            balance: d.balance as number,
            type: (d.type as string) ?? (d.balance >= 0 ? "Dr" : "Cr"),
          });
        } else {
          setOutstanding(null);
        }
      })
      .catch(() => {
        if (!cancelled) setOutstanding(null);
      });

    return () => {
      cancelled = true;
    };
  }, [party]);

  // ── Nothing to render ─────────────────────────────────────────────────
  if (!party) return null;

  const partyLabel =
    party.party_type === "customer"
      ? "Customer"
      : party.party_type === "supplier"
        ? "Supplier"
        : party.party_type;

  const dotColor =
    party.party_type === "customer"
      ? "bg-blue-500"
      : party.party_type === "supplier"
        ? "bg-amber-500"
        : "bg-slate-500";

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#282832] bg-white dark:bg-[#16161f] p-4 space-y-3">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2">
        <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
        <h3 className="text-xs font-bold text-slate-700 dark:text-[#cbd5e1] uppercase tracking-wider">
          Party Details
        </h3>
      </div>

      {/* ── Party Name ──────────────────────────────────────────── */}
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-[#f1f5f9]">
          {party.name}
        </p>
      </div>

      {/* ── GSTIN ───────────────────────────────────────────────── */}
      {party.gstin && (
        <div className="flex justify-between">
          <span className="text-xs text-slate-500 dark:text-[#64748b]">GSTIN</span>
          <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9] font-mono">
            {party.gstin}
          </span>
        </div>
      )}

      {/* ── Party Type Badge ────────────────────────────────────── */}
      <div className="flex justify-between items-center">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Type</span>
        <div className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${dotColor}`} />
          <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
            {partyLabel}
          </span>
        </div>
      </div>

      {/* ── State + State Code ──────────────────────────────────── */}
      <div className="flex justify-between">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">State</span>
        <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
          {party.state_code
            ? `${stateName(party.state_code)} (Code: ${party.state_code})`
            : "—"}
        </span>
      </div>

      {/* ── Place of Supply ─────────────────────────────────────── */}
      <div className="flex justify-between">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Place of Supply</span>
        <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
          {party.state_code ? placeOfSupply(stateName(party.state_code)) : "—"}
        </span>
      </div>

      {/* ── Address ─────────────────────────────────────────────── */}
      <div className="flex justify-between">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Address</span>
        <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
          —
        </span>
      </div>

      {/* ── Credit Limit ────────────────────────────────────────── */}
      <div className="flex justify-between">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Credit Limit</span>
        <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
          —
        </span>
      </div>

      {/* ── Credit Period ───────────────────────────────────────── */}
      <div className="flex justify-between">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Credit Period</span>
        <span className="text-xs font-medium text-slate-900 dark:text-[#f1f5f9]">
          —
        </span>
      </div>

      {/* ── Outstanding Balance ─────────────────────────────────── */}
      <div className="flex justify-between pt-2 border-t border-slate-100 dark:border-[#282832]">
        <span className="text-xs text-slate-500 dark:text-[#64748b]">Outstanding</span>
        <span
          className={`text-xs font-semibold ${
            outstanding
              ? outstanding.balance >= 0
                ? "text-red-600 dark:text-red-400"
                : "text-green-600 dark:text-green-400"
              : "text-slate-900 dark:text-[#f1f5f9]"
          }`}
        >
          {outstanding ? fmt(Math.abs(outstanding.balance)) : "—"}
        </span>
      </div>
    </div>
  );
}
