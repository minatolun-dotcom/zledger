export const ROLE_HIERARCHY = ["viewer", "accountant", "owner"] as const;
export type CompanyRole = typeof ROLE_HIERARCHY[number];

export const ROLE_LABELS: Record<CompanyRole, string> = {
  owner: "Owner",
  accountant: "Accountant",
  viewer: "Viewer",
};

export const ROLE_BADGES: Record<CompanyRole, string> = {
  owner: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400",
  accountant: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
  viewer: "bg-slate-100 text-slate-600 dark:bg-[#282832] dark:text-[#cbd5e1]",
};

export const ROLE_OPTIONS = ROLE_HIERARCHY.map((r) => ({ value: r, label: ROLE_LABELS[r] }));

export function hasRole(userRole: CompanyRole, requiredRole: CompanyRole): boolean {
  return ROLE_HIERARCHY.indexOf(userRole) >= ROLE_HIERARCHY.indexOf(requiredRole);
}