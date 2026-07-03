import { getUserRole } from "../store/auth";

type Role = "owner" | "accountant" | "viewer";

const ROLEHierarchy: Record<Role, number> = {
  viewer: 0,
  accountant: 1,
  owner: 2,
};

export function useRole() {
  const role = getUserRole();

  const hasPermission = (minRole: Role): boolean => {
    return ROLEHierarchy[role] >= ROLEHierarchy[minRole];
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
