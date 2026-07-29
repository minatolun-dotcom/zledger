/** Shared keyboard shortcut definitions — single source of truth.
 *  When adding a new shortcut, add it here AND implement the handler in the appropriate place.
 *  The help dialog reads directly from this file. */
export interface ShortcutDef {
  keys: string;
  label: string;
  group: string;
}

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

  // Actions
  { keys: "F1", label: "Open keyboard help", group: "Actions" },
  { keys: "F2", label: "New voucher", group: "Actions" },
  { keys: "F3", label: "Search", group: "Actions" },
  { keys: "F4", label: "New record (list pages)", group: "Actions" },
  { keys: "F5", label: "Refresh page", group: "Actions" },
  { keys: "F7", label: "Toggle sidebar", group: "Actions" },
  { keys: "F8", label: "Toggle dark/light mode", group: "Actions" },
  { keys: "Ctrl+A Ctrl+S", label: "Save voucher", group: "Actions" },
  { keys: "Ctrl+F", label: "Focus search on page", group: "Actions" },
  { keys: "Ctrl+D", label: "Duplicate voucher", group: "Actions" },

  // Tab Navigation
  { keys: "Alt+F1–F9", label: "Switch to Nth tab", group: "Tab Navigation" },
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
