"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AccessActionResult } from "@/lib/access/actions";
import { decodeCursor, toPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES } from "./queries";
import { type ApplyErrorKey, type ContactValues, validateContactChanges } from "./schema";

// Public endpoints: RLS (applications.review / .delete), the
// applications_check_decision trigger (approve/reject and the email of an
// approved application need .decide) and the link RPCs decide.

const uuid = z.uuid();

function fail(code: string | undefined, where: string): AccessActionResult {
  if (code === "42501") return { status: "forbidden" };
  if (code === "23514" || code === "22P02") return { status: "invalid" };
  console.error(`${where} failed`, { code });
  return { status: "error" };
}

// Zero rows touched = RLS hid the row (no permission) or it doesn't exist.
async function updateApplication(id: string, values: { status?: (typeof APPLICATION_STATUSES)[number]; admin_notes?: string | null }, where: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("applications").update(values).eq("id", id).select("id");
  if (error) return fail(error.code, where);
  if (!data.length) return { status: "forbidden" } as const;
  refresh();
  return { status: "ok" } as const;
}

export async function setApplicationStatus(id: string, status: string): Promise<AccessActionResult> {
  const input = z.object({ id: uuid, status: z.enum(APPLICATION_STATUSES) }).safeParse({ id, status });
  if (!input.success) return { status: "invalid" };
  return updateApplication(input.data.id, { status: input.data.status }, "setApplicationStatus");
}

export async function saveApplicationNotes(id: string, notes: string): Promise<AccessActionResult> {
  const input = z.object({ id: uuid, notes: z.string().max(4000) }).safeParse({ id, notes });
  if (!input.success) return { status: "invalid" };
  const value = input.data.notes.trim();
  return updateApplication(input.data.id, { admin_notes: value || null }, "saveApplicationNotes");
}

/** KVKK erasure. Needs applications.delete. */
export async function deleteApplication(id: string): Promise<AccessActionResult> {
  if (!uuid.safeParse(id).success) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("applications").delete().eq("id", id).select("id");
  if (error) return fail(error.code, "deleteApplication");
  if (!data.length) return { status: "forbidden" };
  return { status: "ok" };
}

export type ApplicationContactResult =
  | AccessActionResult
  | { status: "invalid"; fieldErrors: Record<string, ApplyErrorKey> };

const rawText = z.string().max(1000);

/**
 * Staff correction of name, phone and email (applications.review). Only the
 * fields that changed are validated and written. "duplicate" = another open
 * application already uses the new email. Correcting the email of an approved,
 * unlinked application to a pending account's sign-in email links and
 * activates that account (DB trigger).
 */
export async function saveApplicationContact(id: string, values: ContactValues): Promise<ApplicationContactResult> {
  const input = z
    .object({ id: uuid, full_name: rawText, phone: rawText, email: rawText })
    .safeParse({ id, ...values });
  if (!input.success) return { status: "invalid" };
  const { id: applicationId, ...contact } = input.data;

  const supabase = await createClient();
  const { data: current, error } = await supabase
    .from("applications")
    .select("full_name, phone, email")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) return fail(error.code, "saveApplicationContact");
  if (!current) return { status: "forbidden" };

  const checked = validateContactChanges(current, contact);
  if (!checked.ok) return { status: "invalid", fieldErrors: checked.fieldErrors };
  if (!Object.keys(checked.data).length) return { status: "ok" };

  const { data: updated, error: updateError } = await supabase
    .from("applications")
    .update(checked.data)
    .eq("id", applicationId)
    .select("id");
  if (updateError) {
    if (updateError.code === "23505") return { status: "duplicate" };
    return fail(updateError.code, "saveApplicationContact");
  }
  if (!updated.length) return { status: "forbidden" };
  refresh();
  return { status: "ok" };
}

export type LinkableAccount = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  /** Sign-in email; null if the account has none on file. */
  email: string | null;
  created_at: string;
};

/** Pending accounts an application can be linked to, newest first, one page (applications.decide). */
export async function findLinkableAccounts(input: {
  search?: string;
  cursor?: string | null;
}): Promise<{ items: LinkableAccount[]; nextCursor: string | null } | { status: "forbidden" | "error" }> {
  const parsed = z
    .object({ search: z.string().max(200).optional(), cursor: z.string().max(200).nullish() })
    .safeParse(input);
  if (!parsed.success) return { status: "error" };
  const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !cursor) return { status: "error" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("linkable_accounts", {
    search: parsed.data.search?.trim() || undefined,
    after_created: cursor?.createdAt,
    after_id: cursor?.id,
  });
  if (error) {
    if (error.code === "42501") return { status: "forbidden" };
    console.error("findLinkableAccounts failed", { code: error.code });
    return { status: "error" };
  }
  // Generated types claim avatar_url/email are non-null; they can be null.
  return toPage(data as LinkableAccount[]);
}

/** Links an unlinked, non-rejected application to a pending account (applications.decide). */
export async function linkApplication(applicationId: string, profileId: string): Promise<AccessActionResult> {
  const input = z.object({ applicationId: uuid, profileId: uuid }).safeParse({ applicationId, profileId });
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("link_application", {
    application_id: input.data.applicationId,
    target_id: input.data.profileId,
  });
  // P0002: the application or the account is no longer linkable.
  if (error) return error.code === "P0002" ? { status: "invalid" } : fail(error.code, "linkApplication");
  refresh();
  return { status: "ok" };
}
