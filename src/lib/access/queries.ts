import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { afterCursorFilter, type Cursor, ilikeContains, PAGE_SIZE, toPage } from "@/lib/pagination";

export type MemberStatus = Enums<"member_status">;
export const MEMBER_STATUSES = ["pending", "active", "inactive"] as const satisfies readonly MemberStatus[];

// RLS returns other people's pending/inactive profiles and emails only to members.manage.
export async function listMembers({ status, query, cursor }: { status: MemberStatus; query?: string; cursor?: Cursor | null }) {
  const supabase = await createClient();
  let request = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, status, created_at, role_id, member_contacts(email)")
    .eq("status", status);
  if (query) request = request.ilike("full_name", ilikeContains(query));
  if (cursor) request = request.or(afterCursorFilter(cursor));

  const { data, error } = await request
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) throw new Error(`listMembers failed: ${error.code}`);
  return toPage(data);
}

export async function countMembersByStatus() {
  const supabase = await createClient();
  const counts = await Promise.all(
    MEMBER_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`countMembersByStatus failed: ${error.code}`);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<MemberStatus, number>;
}

/**
 * All roles with permissions and holder counts. Not paginated on purpose:
 * roles are a short, admin-curated list (a handful), unlike members.
 */
export async function listRoles() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, is_admin, role_permissions(permission), profiles(count)")
    .order("is_admin", { ascending: false })
    .order("name");
  if (error) throw new Error(`listRoles failed: ${error.code}`);
  return data.map((r) => ({
    id: r.id,
    name: r.name,
    isAdmin: r.is_admin,
    permissions: r.role_permissions.map((p) => p.permission),
    holders: r.profiles[0]?.count ?? 0,
  }));
}
