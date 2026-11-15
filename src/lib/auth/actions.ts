"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "./safe-next";
import { signInErrorPath } from "./sign-in-error";

export async function signInWithGoogle(formData: FormData) {
  const next = safeNextPath(formData.get("next"), "/account");
  // The origin is also checked by Supabase against its redirect allow-list.
  const origin = (await headers()).get("origin");
  if (!origin) redirect(signInErrorPath(next));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data.url) redirect(signInErrorPath(next));
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  // This device only: auth-js defaults to "global", which would also end the member's sessions on their other devices.
  // Account deletion ends every session itself (`admin.signOut(jwt, "global")` in deletion-actions.ts).
  await supabase.auth.signOut({ scope: "local" });
  // The proxy sends "/" to the visitor's language.
  redirect("/");
}
