import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import { afterCursorFilter, type Cursor, PAGE_SIZE, toPage } from "@/lib/pagination";

export type ApplicationStatus = Enums<"application_status">;
export const APPLICATION_STATUSES = ["new", "contacted", "approved", "rejected"] as const satisfies readonly ApplicationStatus[];

const LIST_COLUMNS =
  "id, status, full_name, city, district, side, license_class, owns_motorcycle, motorcycle_brand, motorcycle_model, heard_from, utm_campaign, created_at";

// RLS returns rows only with applications.view; for anyone else these are empty.
export async function listApplications(status: ApplicationStatus, cursor?: Cursor | null) {
  const supabase = await createClient();
  let request = supabase.from("applications").select(LIST_COLUMNS).eq("status", status);
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
    APPLICATION_STATUSES.map(async (status) => {
      const { count, error } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`countApplicationsByStatus failed: ${error.code}`);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<ApplicationStatus, number>;
}

export async function getApplication(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(
      "*, reviewer:profiles!applications_reviewed_by_fkey(full_name), member:profiles!applications_profile_id_fkey(full_name, status)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getApplication failed: ${error.code}`);
  return data;
}
