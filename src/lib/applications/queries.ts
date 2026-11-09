import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { afterCursorFilter, type Cursor, PAGE_SIZE, toPage } from "@/lib/pagination";

export type ApplicationStatus = Enums<"application_status">;
export const APPLICATION_STATUSES = ["new", "contacted", "approved", "rejected"] as const satisfies readonly ApplicationStatus[];

/** Tabs on the applications list: the real statuses plus approved applicants who haven't signed in yet. */
export const APPLICATION_FILTERS = [...APPLICATION_STATUSES, "unlinked"] as const;
export type ApplicationFilter = (typeof APPLICATION_FILTERS)[number];

const LIST_COLUMNS =
  "id, status, full_name, city, district, side, license_class, owns_motorcycle, motorcycle_brand, motorcycle_model, heard_from, utm_campaign, created_at";

// RLS returns rows only with applications.view; for anyone else these are empty.
export async function listApplications(filter: ApplicationFilter, cursor?: Cursor | null) {
  const supabase = await createClient();
  let request = supabase.from("applications").select(LIST_COLUMNS);
  request =
    filter === "unlinked" ? request.eq("status", "approved").is("profile_id", null) : request.eq("status", filter);
  if (cursor) request = request.or(afterCursorFilter(cursor));
  const { data, error } = await request
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (error) throw new Error(`listApplications failed: ${error.code}`);
  return toPage(data);
}

export async function countApplicationsByStatus() {
  const supabase = await createClient();
  const counts = await Promise.all(
    APPLICATION_FILTERS.map(async (filter) => {
      let request = supabase.from("applications").select("id", { count: "exact", head: true });
      request =
        filter === "unlinked" ? request.eq("status", "approved").is("profile_id", null) : request.eq("status", filter);
      const { count, error } = await request;
      if (error) throw new Error(`countApplicationsByStatus failed: ${error.code}`);
      return [filter, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<ApplicationFilter, number>;
}

const isUuidLike = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function getApplication(id: string) {
  if (!isUuidLike(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select("*, reviewer:profiles!applications_reviewed_by_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getApplication failed: ${error.code}`);
  return data;
}

export type ApplicationAccount = {
  id: string;
  fullName: string;
  /** Sign-in email; null if the account has no contact row. */
  email: string | null;
  status: Enums<"member_status">;
};

/**
 * The account an application is linked to (applications.view), or null when unlinked. Uses an RPC because profiles
 * RLS hides pending/inactive accounts and sign-in emails from staff without members.manage.
 */
export async function getApplicationAccount(applicationId: string): Promise<ApplicationAccount | null> {
  // Runs alongside getApplication on the detail page: a malformed id must give 404, not a uuid cast error.
  if (!isUuidLike(applicationId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("application_account", { application_id: applicationId }).maybeSingle();
  if (error) throw new Error(`getApplicationAccount failed: ${error.code}`);
  if (!data) return null;
  // Generated types say non-null; email is null without a member_contacts row.
  return { id: data.id, fullName: data.full_name, email: (data.email as string | null) ?? null, status: data.status };
}

/** Status of the signed-in user's latest application (linked, or unlinked with their sign-in email), or null. Signed-in only. */
export async function getMyApplicationStatus(): Promise<ApplicationStatus | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_application_status");
  if (error) throw new Error(`getMyApplicationStatus failed: ${error.code}`);
  // The generated type says non-null, but the function returns null without an application.
  return (data as ApplicationStatus | null) ?? null;
}
