import { useEffect, useState } from "react";
import { api } from "../api/client";

interface AccountGroup {
  id: string;
  name: string;
  system_code: string | null;
  parent_id: string | null;
  group_type: string;
  nature: string;
}

interface Ledger {
  id: string;
  name: string;
  system_code: string | null;
  group_id: string;
  opening_balance: number;
  opening_balance_type: string;
  is_protected: boolean;
  is_active: boolean;
}

export default function ChartOfAccountsPage() {
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<AccountGroup[]>("/coa/groups"),
      api.get<Ledger[]>("/coa/ledgers"),
    ])
      .then(([g, l]) => { setGroups(g); setLedgers(l); })
      .finally(() => setLoading(false));
  }, []);

  const primaryGroups = groups.filter((g) => g.group_type === "primary");
  const subGroups = groups.filter((g) => g.group_type === "sub");

  const groupLedgers = (groupId: string) =>
    ledgers.filter((l) => l.group_id === groupId && l.is_active);

  if (loading) return <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Loading...</p>;

  return (
    <div>
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Chart of Accounts</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hierarchical view of account groups and ledgers.</p>

      <div className="mt-6 space-y-4">
        {primaryGroups.map((pg) => {
          const children = subGroups.filter((sg) => sg.parent_id === pg.id);
          const hasContent = children.length > 0 || groupLedgers(pg.id).length > 0;
          if (!hasContent) return null;

          return (
            <div key={pg.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-5 py-3">
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{pg.name}</h3>
                <span className="rounded-full bg-slate-200 dark:bg-slate-600 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300 uppercase">{pg.nature}</span>
              </div>
              <div className="px-5 py-3">
                {children.map((sg) => {
                  const sgLedgers = groupLedgers(sg.id);
                  return (
                    <div key={sg.id} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-2 py-1">
                        <span className="text-base font-medium text-slate-700 dark:text-slate-300">{sg.name}</span>
                      </div>
                      {sgLedgers.length > 0 && (
                        <table className="ml-4 mt-1 w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-400 dark:text-slate-500">
                              <th className="py-1 pr-4">Ledger</th>
                              <th className="py-1 pr-4 text-right">Opening Balance</th>
                              <th className="py-1">Dr/Cr</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sgLedgers.map((l) => (
                              <tr key={l.id} className="border-b border-slate-50 dark:border-slate-700">
                                <td className="py-1.5 pr-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                                  {l.name}
                                  {l.is_protected && (
                                    <span className="ml-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">SYSTEM</span>
                                  )}
                                </td>
                                <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                  {l.opening_balance > 0 ? l.opening_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                                </td>
                                <td className="py-1.5 text-slate-500 dark:text-slate-400">{l.opening_balance > 0 ? l.opening_balance_type : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {sgLedgers.length === 0 && (
                        <p className="ml-4 text-sm text-slate-400 dark:text-slate-500 italic">No ledgers</p>
                      )}
                    </div>
                  );
                })}
                {groupLedgers(pg.id).length > 0 && (
                  <div className="mt-3">
                    {children.length > 0 && <p className="mb-1 text-xs font-medium uppercase text-slate-400 dark:text-slate-500">Direct Ledgers</p>}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-700 text-left text-xs font-medium uppercase text-slate-400 dark:text-slate-500">
                          <th className="py-1 pr-4">Ledger</th>
                          <th className="py-1 pr-4 text-right">Opening Balance</th>
                          <th className="py-1">Dr/Cr</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groupLedgers(pg.id).map((l) => (
                          <tr key={l.id} className="border-b border-slate-50 dark:border-slate-700">
                            <td className="py-1.5 pr-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                              {l.name}
                              {l.is_protected && (
                                <span className="ml-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">SYSTEM</span>
                              )}
                            </td>
                            <td className="py-1.5 pr-4 text-right tabular-nums text-slate-700 dark:text-slate-300">
                              {l.opening_balance > 0 ? l.opening_balance.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
                            </td>
                            <td className="py-1.5 text-slate-500 dark:text-slate-400">{l.opening_balance > 0 ? l.opening_balance_type : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
