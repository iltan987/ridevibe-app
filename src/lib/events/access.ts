import "server-only";
import { cache } from "react";
import type { getPathname } from "@/i18n/navigation";
import { requireAccess } from "@/lib/auth/require-access";
import { getCurrentUser } from "@/lib/auth/user";
import { createClient } from "@/lib/supabase/server";

type Href = Parameters<typeof getPathname>[0]["href"];

/**
 * Whether the signed-in user may see events: the database gate (`private.can_see_events`, release gate: organisers
 * only until the joining branch ships). False without a session (no request) and on an error (the code is logged).
 * Deduplicated per request; reads the session, so render behind <Suspense>.
 */
export const canSeeEvents = cache(async (): Promise<boolean> => {
  if ((await getCurrentUser()) === null) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("can_see_events");
  if (error) {
    console.error("canSeeEvents failed", { code: error.code });
    return false;
  }
  return data;
});

/** Page gate for event routes: signed out → sign-in, no access → 404. */
export function requireEventsAccess(returnTo: Href) {
  return requireAccess(returnTo, () => canSeeEvents());
}
