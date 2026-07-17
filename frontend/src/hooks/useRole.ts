import { getUserRole } from "../store/auth";
import { ROLE_HIERARCHY, type CompanyRole } from "../config/roles";

export function useRole() {
  const role = getUserRole() as CompanyRole;

  const hasPermission = (minRole: CompanyRole): boolean => {
    return ROLE_HIERARCHY.indexOf(role) >= ROLE_HIERARCHY.indexOf(minRole);
  };

  return {
    role,
    isViewer: role === "viewer",
    isAccountant: role === "accountant",
    isOwner: role === "owner",
    canEdit: hasPermission("accountant"),
    canManageMembers: hasPermission("owner"),
  };
}
