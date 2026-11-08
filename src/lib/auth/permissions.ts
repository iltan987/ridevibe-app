import { Constants, type Enums } from "@/lib/supabase/database.types";

// Mirrors supabase/schemas/05_roles.sql. The database enforces every rule;
// these helpers only decide what the UI shows.
export type Permission = Enums<"permission">;
export const PERMISSIONS = Constants.public.Enums.permission;

export type Access = {
  /** Built-in admin role: every permission plus editing/assigning roles. */
  isAdmin: boolean;
  /** Effective permissions (empty unless the member is active). */
  permissions: readonly Permission[];
};

export const NO_ACCESS: Access = { isAdmin: false, permissions: [] };

export function can(access: Access | null | undefined, permission: Permission) {
  return !!access && (access.isAdmin || access.permissions.includes(permission));
}

/** Anything that unlocks a staff screen (admin menu entries). */
export function hasStaffAccess(access: Access | null | undefined) {
  return !!access && (access.isAdmin || access.permissions.length > 0);
}
