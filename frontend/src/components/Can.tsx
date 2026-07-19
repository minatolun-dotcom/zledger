import type { ReactNode } from "react";
import { usePermissions } from "../hooks/useRole";

interface CanProps {
  /** Permission required to render the children. */
  permission: string;
  /** Rendered when the user lacks the permission. Defaults to nothing. */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Render children only if the active user holds the given permission.
 *
 * Uses the granular permission set from `/me/permissions` (with a role-based
 * fallback). Use this to hide action buttons / sections from viewers.
 */
export default function Can({ permission, fallback = null, children }: CanProps) {
  const { can } = usePermissions();
  return <>{can(permission) ? children : fallback}</>;
}
