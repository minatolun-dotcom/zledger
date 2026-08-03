/** Shared keyboard shortcut definitions — single source of truth.
 *  When adding a new shortcut, add it here AND implement the handler in the appropriate place.
 *  The help dialog reads directly from this file. */
export interface ShortcutDef {
  keys: string;
  label: string;
  group: string;
}


/** Canonical Tally-style F-key per voucher type id.
 *  Single source of truth: the vouchers page tab labels and the keydown
 *  handler in usePageAccelerators both derive from this map. */
export const VOUCHER_TYPE_KEYS: Record<string, string> = {
  sales: "F1",
  purchase: "F2",
  payment: "F3",
  receipt: "F4",
  contra: "F5",
  journal: "F6",
  credit_note: "F7",
  debit_note: "F8",
};
export const SHORTCUTS: ShortcutDef[] = [
  // Page Navigation
  { keys: "Alt+D", label: "Dashboard", group: "Page Navigation" },
  { keys: "Alt+V", label: "Vouchers", group: "Page Navigation" },
  { keys: "Alt+C", label: "Chart of Accounts", group: "Page Navigation" },
  { keys: "Alt+P", label: "Parties", group: "Page Navigation" },
  { keys: "Alt+R", label: "Reports", group: "Page Navigation" },
  { keys: "Alt+G", label: "GST", group: "Page Navigation" },
  { keys: "Alt+T", label: "TDS / TCS", group: "Page Navigation" },
  { keys: "Alt+I", label: "Inventory", group: "Page Navigation" },
  { keys: "Alt+E", label: "Data Import / Export", group: "Page Navigation" },
  { keys: "Alt+B", label: "Bank Reconciliation", group: "Page Navigation" },
  { keys: "Alt+L", label: "Loans", group: "Page Navigation" },
  { keys: "Alt+F", label: "Fixed Assets", group: "Page Navigation" },
  { keys: "Alt+N", label: "Compliance", group: "Page Navigation" },
  { keys: "Alt+M", label: "Payments & Receivables", group: "Page Navigation" },
  { keys: "Alt+U", label: "Manufacturing", group: "Page Navigation" },
  { keys: "Alt+X", label: "Batches", group: "Page Navigation" },
  { keys: "Alt+S", label: "Company Settings", group: "Page Navigation" },

  // Actions
  { keys: "Alt+F1", label: "Open keyboard help", group: "Actions" },
  { keys: "Alt+F2", label: "New voucher", group: "Actions" },
  { keys: "Alt+F3", label: "Search", group: "Actions" },
  { keys: "Alt+F4", label: "New record (list pages)", group: "Actions" },
  { keys: "Alt+F5", label: "Refresh page", group: "Actions" },
  { keys: "Alt+F7", label: "Toggle sidebar", group: "Actions" },
  { keys: "Alt+F8", label: "Toggle dark/light mode", group: "Actions" },
  { keys: "Ctrl+S", label: "Save voucher", group: "Actions" },
  { keys: "Ctrl+Enter", label: "Save and continue", group: "Actions" },
  { keys: "Ctrl+F", label: "Focus search on page", group: "Actions" },
  { keys: "Ctrl+D", label: "Duplicate voucher", group: "Actions" },
  { keys: "Alt+N", label: "New voucher (similar)", group: "Actions" },

  // Voucher Type Shortcuts (Tally-style)
  { keys: "F1", label: "Sales Voucher", group: "Voucher Types" },
  { keys: "F2", label: "Purchase Voucher", group: "Voucher Types" },
  { keys: "F3", label: "Receipt Voucher", group: "Voucher Types" },
  { keys: "F4", label: "Payment Voucher", group: "Voucher Types" },
  { keys: "F5", label: "Contra Voucher", group: "Voucher Types" },
  { keys: "F6", label: "Journal Voucher", group: "Voucher Types" },
  { keys: "F7", label: "Credit Note", group: "Voucher Types" },
  { keys: "F8", label: "Debit Note", group: "Voucher Types" },

  // Tab Navigation
  { keys: "Alt+← →", label: "Switch to prev/next voucher type", group: "Tab Navigation" },
  { keys: "← →", label: "Prev / Next tab (when focused)", group: "Tab Navigation" },

  // Voucher Form Fields
  { keys: "Enter Tab", label: "Next field", group: "Voucher Form Fields" },
  { keys: "Esc", label: "Reset form / Close top modal", group: "Voucher Form Fields" },

  // Master Selector Popups
  { keys: "Ctrl+Enter", label: "Open inline edit", group: "Master Selector Popups" },
  { keys: "Enter", label: "Select highlighted option", group: "Master Selector Popups" },
  { keys: "↑ ↓", label: "Navigate options", group: "Master Selector Popups" },
  { keys: "Esc", label: "Close popup", group: "Master Selector Popups" },
];
