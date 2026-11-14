import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CHUNK_SIZE, chunks, readAll, uniqueById } from "@/lib/pagination";
import type { StaffStatus } from "./members-view";

export type AdminProfile = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  status: StaffStatus;
  created_at: string;
  role_id: string | null;
  email: string | null;
};

/**
 * Every profile (all staff-visible statuses) for the admin members list, newest first, read in CHUNK_SIZE pages up to
 * LIST_CEILING; the browser filters and pages. RLS returns other people's pending/inactive profiles and emails only
 * to members.manage.
 */
export async function listAllProfiles(): Promise<{ profiles: AdminProfile[]; overCeiling: boolean }> {
  const supabase = await createClient();
  const { items, overCeiling } = await readAll(async (from, to) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, status, created_at, role_id, member_contacts(email)")
      .neq("status", "deleting")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    if (error) throw new Error(`listAllProfiles failed: ${error.code}`);
    return data;
  });
  const profiles = uniqueById(items).map(
    ({ member_contacts, status, ...profile }): AdminProfile => ({
      ...profile,
      // The query above excludes deleting accounts; the cast narrows the type to match.
      status: status as StaffStatus,
      email: member_contacts?.email ?? null,
    }),
  );
  return { profiles, overCeiling };
}

/**
 * Which of these profiles have an open (new/contacted/approved) application? Needs members.manage. One call per
 * CHUNK_SIZE ids: `max_rows` caps the RPC's result (one row per id) too.
 */
export async function getPendingApplicationFlags(ids: string[]): Promise<Map<string, boolean>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const results = await Promise.all(
    chunks(ids, CHUNK_SIZE).map(async (profile_ids) => {
      const { data, error } = await supabase.rpc("pending_application_flags", { profile_ids });
      if (error) throw new Error(`getPendingApplicationFlags failed: ${error.code}`);
      return data;
    }),
  );
  return new Map(results.flat().map((row) => [row.profile_id, row.has_application]));
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
