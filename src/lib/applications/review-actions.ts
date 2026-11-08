"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AccessActionResult } from "@/lib/access/actions";
import { createClient } from "@/lib/supabase/server";
import { APPLICATION_STATUSES } from "./queries";

// Public endpoints: RLS (applications.review / .delete) and the
// applications_check_decision trigger (approve/reject needs .decide) decide.

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
