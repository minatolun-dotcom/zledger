import { useEffect, useState } from "react";
import { api } from "../../../api/client";
import type { Party } from "../types";

export interface OutstandingInfo {
  /** Positive = Dr (amount receivable/owed to the company), negative = Cr. */
  balance: number;
  type: "Dr" | "Cr";
}

interface BillItem {
  party_id?: string | null;
  party_name?: string | null;
  unpaid_amount?: number;
}

/**
 * Fetch a party's outstanding balance from the receivables (customers) or
 * payables (suppliers) endpoint, summing `unpaid_amount` across open bills.
 *
 * Returns null while loading / on error / when the party has no balance.
 * Shared by the voucher sidebar and the Sales/Purchase party cards so
 * outstanding always comes from the same source.
 *
 * `side` disambiguates a Both (supplier-and-customer) party: a Both party in
 * a Purchase/Payment voucher shows its PAYABLE bills, in a Sales/Receipt
 * voucher its RECEIVABLE bills (Tally parity). For single-sided parties the
 * party type decides regardless of the hint.
 */
export function usePartyOutstanding(
  party: Party | null | undefined,
  side?: "receivable" | "payable",
): OutstandingInfo | null {
  const [outstanding, setOutstanding] = useState<OutstandingInfo | null>(null);

  useEffect(() => {
    if (!party?.id) {
      setOutstanding(null);
      return;
    }
    let cancelled = false;

    const isReceivable =
      party.party_type === "customer" ||
      party.party_type === "debtor" ||
      // A Both party follows the voucher's side; defaults to receivable when
      // the caller gives no hint (legacy behaviour).
      (party.party_type === "both" && side !== "payable");
    const endpoint = isReceivable ? "/payments/receivables" : "/payments/payables";

    api
      .get<{ items?: BillItem[] }>(endpoint)
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        let balance = 0;
        for (const it of items) {
          if (
            (it.party_id && it.party_id === party.id) ||
            (!it.party_id && it.party_name === party.name)
          ) {
            balance += Number(it.unpaid_amount) || 0;
          }
        }
        setOutstanding(
          balance !== 0 ? { balance, type: balance >= 0 ? "Dr" : "Cr" } : null,
        );
      })
      .catch(() => {
        if (!cancelled) setOutstanding(null);
      });

    return () => {
      cancelled = true;
    };
  }, [party?.id, party?.name, party?.party_type, side]);

  return outstanding;
}
