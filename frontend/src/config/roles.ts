export const ROLE_HIERARCHY = ["viewer", "accountant", "admin", "owner"] as const;
export type CompanyRole = typeof ROLE_HIERARCHY[number];

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Owner",
  admin: "Admin",
  accountant: "Accountant",
  viewer: "Viewer",
};

export const ROLE_BADGES: Record<CompanyRole, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400",
  admin: "bg-purple-100 text-purple-800 dark:bg-purple-500/10 dark:text-purple-400",
  accountant: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
  viewer: "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]",
};

export const ROLE_OPTIONS = ROLE_HIERARCHY.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export const ROLE_DESCRIPTIONS: Record<CompanyRole, string> = {
  owner: "Full control. Manages members, company settings, financial years, modules, and all accounting. Only the owner can create financial years and enable/disable modules.",
  admin: "Operational manager. Can manage members and company settings, plus everything an accountant does — but cannot manage financial years or modules.",
  accountant: "Day-to-day bookkeeper. Creates and edits vouchers, manages ledgers, inventory, GST, TDS/TCS, assets, loans and payments. Read-only access to members and company settings.",
  viewer: "Read-only access. Can view dashboards, accounts, reports and other modules but cannot create, edit or delete anything.",
};

export function hasRole(userRole: CompanyRole, requiredRole: CompanyRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}