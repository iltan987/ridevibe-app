import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

// A client with no cookies and no session: it only calls what `anon` may call. Unlike `server.ts` it never reads
// request data, so it is safe inside a `"use cache"` scope (cached results must not depend on who asks).
export function createPublicClient() {
  const { url, publishableKey } = supabaseEnv();
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
