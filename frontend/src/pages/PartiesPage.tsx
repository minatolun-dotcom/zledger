import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToastStore } from "../store/toast";
import Select from "../components/Select";
import ListSkeleton from "./skeletons/ListSkeleton";

interface Party {
  id: string;
  name: string;
  party_type: string;
  gstin: string | null;
  state_code: string | null;
  ledger_id: string | null;
}

const PARTY_TYPE_LABELS: Record<string, string> = {
  customer: "Customer",
  supplier: "Supplier",
  both: "Supplier and Customer",
  employee: "Employee",
  transporter: "Transporter",
  agent_broker: "Agent / Broker",
  contractor: "Contractor",
  consultant: "Consultant",
  lender: "Lender",
};

// Party types that map to a payable ledger (Sundry Creditors) rather than
// a receivable ledger (Sundry Debtors).
const PAYABLE_TYPES = new Set([
  "supplier",
  "both",
  "employee",
  "transporter",
  "agent_broker",
  "contractor",
  "consultant",
  "lender",
]);

function typeLabel(type: string): string {
  return PARTY_TYPE_LABELS[type] ?? type;
}

function ledgerGroupLabel(type: string): string {
  return PAYABLE_TYPES.has(type) ? "Sundry Creditors" : "Sundry Debtors";
}

export default function PartiesPage() {
  const navigate = useNavigate();
  const toast = useToastStore();
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    api
      .get<Party[]>("/coa/parties")
      .then((data) => setParties(data))
      .catch((err) => toast.error(err?.message || "Failed to load parties"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      if (typeFilter && p.party_type !== typeFilter) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(p.gstin || "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [parties, typeFilter, search]);

  const typeOptions = useMemo(() => {
    const used = Array.from(new Set(parties.map((p) => p.party_type)));
    return [
      { value: "", label: "All Types" },
      ...used.map((t) => ({ value: t, label: typeLabel(t) })),
    ];
  }, [parties]);

  const openLedger = (p: Party) => {
    // Open the COA with the relevant Sundry Debtors / Creditors group expanded
    // and the party's ledger pre-selected via search.
    const params = new URLSearchParams();
    params.set("q", p.name);
    navigate(`/chart-of-accounts?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-800 dark:text-[#f1f5f9]">Parties</h1>
          <p className="text-sm text-slate-500 dark:text-[#94a3b8]">
            Customers, suppliers and other parties. Each party is linked to a ledger under
            Sundry Debtors or Sundry Creditors.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or GSTIN"
          className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-blue-400 dark:border-[#282832] dark:bg-[#1a1a24] dark:text-[#f1f5f9] dark:placeholder-[#64748b]"
        />
        <div className="w-44">
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            options={typeOptions}
            placeholder="All Types"
          />
        </div>
      </div>

      {loading ? (
        <ListSkeleton title="Parties" cols={4} rows={6} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-[#282832]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-[#1a1a24] dark:bg-[#16161f] dark:text-[#94a3b8]">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">GSTIN</th>
                <th className="px-4 py-3">Linked Ledger</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-500 dark:text-[#94a3b8]">
                    No parties found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 dark:border-[#1a1a24] dark:hover:bg-[#16161f]"
                  >
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-[#f1f5f9]">{p.name}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-500 dark:text-blue-400">
                        {typeLabel(p.party_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-[#cbd5e1]">{p.gstin || "—"}</td>
                    <td className="px-4 py-3">
                      {p.ledger_id ? (
                        <button
                          onClick={() => openLedger(p)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-[#1a1a24] dark:text-[#cbd5e1] dark:hover:bg-[#282832]"
                          title={`View ${p.name} in ${ledgerGroupLabel(p.party_type)}`}
                        >
                          <span className="text-slate-400 dark:text-[#64748b]">{ledgerGroupLabel(p.party_type)}</span>
                          <span className="text-blue-500 dark:text-blue-400">→ {p.name}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-[#64748b]">No ledger linked</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
