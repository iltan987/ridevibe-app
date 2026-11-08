import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import { type Access, NO_ACCESS, PERMISSIONS } from "./permissions";

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Pick<Tables<"profiles">, "full_name" | "avatar_url" | "status" | "preferred_locale"> | null;
  /** Null = regular member without a staff role. */
  role: { id: string; name: string; isAdmin: boolean } | null;
  access: Access;
};

/**
 * The signed-in user, their profile, role and effective permissions, or null.
 * Reads the session cookie, so callers must render behind <Suspense>.
 * Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getClaims() verifies the JWT; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const id = data.claims.sub;
  const { data: row } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, status, preferred_locale, role:roles(id, name, is_admin, role_permissions(permission))")
    .eq("id", id)
    .maybeSingle();

  const { role: roleRow, ...profile } = row ?? { role: null };
  const role = roleRow ? { id: roleRow.id, name: roleRow.name, isAdmin: roleRow.is_admin } : null;
  // Same rule as private.has_permission(): only active members have rights.
  const access: Access =
    row?.status === "active" && roleRow
      ? {
          isAdmin: roleRow.is_admin,
          permissions: roleRow.is_admin ? PERMISSIONS : roleRow.role_permissions.map((p) => p.permission),
        }
      : NO_ACCESS;

  return {
    id,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    profile: row ? (profile as CurrentUser["profile"]) : null,
    role,
    access,
  };
});
