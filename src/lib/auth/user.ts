import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Pick<
    Tables<"profiles">,
    "full_name" | "avatar_url" | "role" | "status" | "preferred_locale"
  > | null;
};

/**
 * The signed-in user and their profile, or null. Reads the session cookie, so
 * callers must render behind <Suspense>. Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  // getClaims() verifies the JWT; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  const id = data.claims.sub;
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url, role, status, preferred_locale")
    .eq("id", id)
    .maybeSingle();

  return {
    id,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    profile,
  };
});
