import { useAuthStore, getUserRole } from "../store/auth";
import { ROLE_HIERARCHY, type CompanyRole } from "../config/roles";

export function useRole() {
  const role = getUserRole() as CompanyRole;
  const { can } = usePermissions();

  const hasPermission = (minRole: CompanyRole): boolean => {
    return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(minRole);
  };

  return {
    role,
    isViewer: role === "viewer",
    isAccountant: role === "accountant",
    isAdmin: role === "admin",
    isOwner: role === "owner",
    canEdit: hasPermission("accountant") || can("create_voucher"),
    canManageMembers: can("manage_members"),
    canManageCompany: can("manage_company"),
  };
}

/**
 * Resolve effective permissions for the active company.
 *
 * Prefers the granular permission set fetched from `/me/permissions`.
 * Falls back to role-based inference when permissions haven't loaded yet
 * (e.g. before the first API round-trip), so UI never flashes into an
 * over-permissive state.
 */
export function usePermissions() {
  const role = getUserRole() as CompanyRole;
  const activeCompanyId = useAuthStore((s) => s.activeCompanyId);
  const permissionsByCompany = useAuthStore((s) => s.permissionsByCompany);
  const perms = activeCompanyId ? permissionsByCompany[activeCompanyId] : undefined;

  const can = (permission: string): boolean => {
    if (perms) return perms.includes(permission);
    // Fallback: infer from role hierarchy.
    if (role === "owner") return true;
    if (role === "admin") return !permission.startsWith("manage_financial_years") &&
      !permission.startsWith("manage_modules");
    if (role === "accountant") return !permission.startsWith("manage_company") &&
      !permission.startsWith("manage_members") &&
      !permission.startsWith("manage_financial_years") &&
      !permission.startsWith("manage_modules");
    return permission.startsWith("view_");
  };

  return { permissions: perms ?? [], can };
}

