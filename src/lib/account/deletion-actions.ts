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
    const { data: own } = await supabase
      .from("profiles")
      .select("deletion_requested_at")
      .eq("id", (await supabase.auth.getClaims()).data?.claims.sub ?? "")
      .maybeSingle();
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

  // Every device: the account is being deleted, so no session may stay.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "global" });
  if (signOutError) console.error("requestAccountDeletion signOut failed", { code: signOutError.code });

  // No refresh() here: it would replace the dialog's done state with a redirect to sign-in
  // (same exception as submitApplication).
  return { status: "ok", deletesOn };
}

export async function cancelAccountDeletion(): Promise<{ status: "ok" | "error" }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_my_account_deletion");
  if (error) {
    console.error("cancelAccountDeletion failed", { code: error.code });
    return { status: "error" };
  }
  refresh();
  return { status: "ok" };
}
