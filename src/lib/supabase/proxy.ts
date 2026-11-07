import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";
import { supabaseEnv } from "./env";

/**
 * Refreshes the Supabase session (if any) and writes updated auth cookies and
 * no-cache headers onto `response`. Does NOT protect routes — pages check the
 * user themselves, close to the data.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  // Anonymous visitors (most traffic from Instagram) have no auth cookie:
  // skip the work entirely.
  const hasAuthCookie = request.cookies
    .getAll()
    .some(({ name }) => name.startsWith("sb-") && name.includes("-auth-token"));
  if (!hasAuthCookie) return response;

  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
        // Prevent CDNs from caching a response that carries a session cookie.
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims(): it refreshes
  // an expired session; removing it causes random sign-outs.
  await supabase.auth.getClaims();

  return response;
}
