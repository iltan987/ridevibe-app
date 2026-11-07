import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";

export type ApplicationStatus = Enums<"application_status">;
export const APPLICATION_STATUSES = ["new", "contacted", "approved", "rejected"] as const satisfies readonly ApplicationStatus[];

const LIST_COLUMNS =
  "id, status, full_name, city, district, side, license_class, owns_motorcycle, motorcycle_brand, motorcycle_model, heard_from, utm_campaign, created_at";

// RLS returns rows only to staff; for anyone else these return empty/null.
export async function listApplications(status: ApplicationStatus) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("applications")
    .select(LIST_COLUMNS)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`listApplications failed: ${error.code}`);
  return data;
}

export async function countApplicationsByStatus() {
  const supabase = await createClient();
  const counts = await Promise.all(
    APPLICATION_STATUSES.map(async (status) => {
      const { count } = await supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<ApplicationStatus, number>;
}

export async function getApplication(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("applications").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`getApplication failed: ${error.code}`);
  return data;
}
