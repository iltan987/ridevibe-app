import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next";
import { signInErrorPath } from "@/lib/auth/sign-in-error";
import { createClient } from "@/lib/supabase/server";

// Google → Supabase → here with a one-time `code` (PKCE). Exchange it for a
// session cookie, then continue to `next`.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"), "/account");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Signing in again within the grace period lands on the recovery card, whatever page was asked for.
      const { data: profile } = await supabase.from("profiles").select("status").eq("id", data.user.id).maybeSingle();
      if (profile?.status === "deleting") {
        const path = next === "/en" || next.startsWith("/en/") ? "/en/account" : "/account";
        return NextResponse.redirect(new URL(path, origin));
      }
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  // Missing/expired code or the user cancelled at Google.
  return NextResponse.redirect(new URL(signInErrorPath(next), origin));
}
