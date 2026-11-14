"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { deletionDate, deletionResult } from "./deletion-result";

export type RequestDeletionResult = { status: "ok"; deletesOn: string } | { status: "lastAdmin" | "error" };

// Log error codes only (KVKK).

export async function requestAccountDeletion(): Promise<RequestDeletionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_my_account_deletion");
  let result = deletionResult(error);
  let deletesOn: string | null = result === "ok" && data ? new Date(data).toISOString() : null;

  if (result === "alreadyDeleting") {
    // Double click or a second tab: the request exists, so show its date.
    const userId = (await supabase.auth.getClaims()).data?.claims.sub;
    const { data: own } = userId
      ? await supabase.from("profiles").select("deletion_requested_at").eq("id", userId).maybeSingle()
      : { data: null };
    if (own?.deletion_requested_at) {
      deletesOn = deletionDate(own.deletion_requested_at).toISOString();
      result = "ok";
    } else {
      result = "error";
    }
  }

  if (result === "lastAdmin") return { status: "lastAdmin" };
  if (result !== "ok" || !deletesOn) {
    console.error("requestAccountDeletion failed", { code: error?.code });
    return { status: "error" };
  }

  // Revoke every session on the server (this device included) WITHOUT touching our cookies. A cookie write in a
  // Server Action (what supabase.auth.signOut() does) marks the path revalidated, so the response would re-render
  // the page: no session -> redirect to /sign-in, and the dialog's done state never shows. The access token is
  // revoked server-side; the done state's button runs `signOut`, which clears the cookies and goes home.
  // getSession() is only used to get the token: the RPC above already proved who the user is.
  const { data: session } = await supabase.auth.getSession();
  const accessToken = session.session?.access_token;
  if (accessToken) {
    const { error: revokeError } = await supabase.auth.admin.signOut(accessToken, "global");
    if (revokeError) console.error("requestAccountDeletion revoke failed", { code: revokeError.code });
  }

  // No refresh() either, for the same reason (same exception as submitApplication).
  return { status: "ok", deletesOn };
}

export async function cancelAccountDeletion(): Promise<{ status: "ok" | "error" }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_account_deletion");
  // Already restored (second tab, double click): nothing left to do, still show the restored page.
  if (error && error.code !== "55000") {
    console.error("cancelAccountDeletion failed", { code: error.code });
    return { status: "error" };
  }
  refresh();
  return { status: "ok" };
}
