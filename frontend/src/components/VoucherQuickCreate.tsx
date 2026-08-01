import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

interface VoucherType {
  id: string;
  label: string;
  shortLabel: string;
  icon: string;
}

const VOUCHER_TYPES: VoucherType[] = [
  { id: "sales", label: "Sales Invoice", shortLabel: "Sales", icon: "◆" },
  { id: "purchase", label: "Purchase Invoice", shortLabel: "Purchase", icon: "◇" },
  { id: "receipt", label: "Receipt", shortLabel: "Receipt", icon: "←" },
  { id: "payment", label: "Payment", shortLabel: "Payment", icon: "→" },
  { id: "contra", label: "Contra", shortLabel: "Contra", icon: "↔" },
  { id: "journal", label: "Journal", shortLabel: "Journal", icon: "✎" },
  { id: "credit_note", label: "Credit Note", shortLabel: "Cr Note", icon: "↩" },
  { id: "debit_note", label: "Debit Note", shortLabel: "Dr Note", icon: "↪" },
];

export default function VoucherQuickCreate() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleCreate = (voucherType: string) => {
    navigate(`/vouchers?action=new&type=${voucherType}`);
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center justify-center h-6 w-6 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-[#cbd5e1] hover:bg-slate-100 dark:hover:bg-[#16161f] transition-colors"
        title="Quick create voucher (Ctrl+Alt+V)"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-[#16161f] border border-slate-200 dark:border-[#282832] rounded-lg shadow-lg z-50">
          <div className="p-2 space-y-0.5">
            {VOUCHER_TYPES.map((vt) => (
              <button
                key={vt.id}
                onClick={() => handleCreate(vt.id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-left transition-colors
                  text-slate-700 hover:bg-slate-100 hover:text-slate-900
                  dark:text-[#cbd5e1] dark:hover:bg-[#1e1e28] dark:hover:text-[#f1f5f9]"
              >
                <span className="text-xs">{vt.icon}</span>
                <span>{vt.shortLabel}</span>
                <span className="ml-auto text-[10px] font-normal text-slate-400 dark:text-[#64748b]">
                  {["sales", "purchase", "receipt", "payment"].includes(vt.id) ? ["F1", "F2", "F3", "F4"][["sales", "purchase", "receipt", "payment"].indexOf(vt.id)] : ""}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
