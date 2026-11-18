"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { AccessActionResult } from "@/lib/access/actions";
import { formDataText } from "@/lib/form-data";
import { readAll, uniqueById } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import { noteBodySchema } from "./notes-schema";

// RLS on member_notes decides who may read, write and delete (members.notes; delete = admins; admin-role targets
// only for admins). We validate shapes and translate error codes.

export type MemberNote = { id: string; body: string; createdAt: string; authorName: string | null };

const uuid = z.uuid();

function fail(code: string | undefined, where: string): AccessActionResult {
  if (code === "42501") return { status: "forbidden" };
  if (code === "23503" || code === "23514") return { status: "invalid" };
  console.error(`${where} failed`, { code });
  return { status: "error" };
}

/** Newest first; an author that is deleted or purged reads as `authorName: null`. */
export async function listMemberNotes(
  profileId: string,
): Promise<{ status: "ok"; notes: MemberNote[] } | { status: "forbidden" | "error" }> {
  if (!uuid.safeParse(profileId).success) return { status: "error" };
  const supabase = await createClient();
  try {
    const { items } = await readAll(async (from, to) => {
      const { data, error } = await supabase
        .from("member_notes")
        .select("id, body, created_at, author:profiles!member_notes_author_id_fkey(full_name)")
        .eq("profile_id", profileId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.code);
      return data;
    });
    return {
      status: "ok",
      notes: uniqueById(items).map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.created_at,
        authorName: n.author?.full_name ?? null,
      })),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : undefined;
    if (code === "42501") return { status: "forbidden" };
    console.error("listMemberNotes failed", { code });
    return { status: "error" };
  }
}

export async function addMemberNote(profileId: string, formData: FormData): Promise<AccessActionResult> {
  const input = z.object({ profileId: uuid, body: noteBodySchema }).safeParse({
    profileId,
    body: formDataText(formData, "body"),
  });
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("member_notes")
    .insert({ profile_id: input.data.profileId, body: input.data.body });
  if (error) return fail(error.code, "addMemberNote");
  refresh();
  return { status: "ok" };
}

export async function deleteMemberNote(noteId: string): Promise<AccessActionResult> {
  if (!uuid.safeParse(noteId).success) return { status: "invalid" };
  const supabase = await createClient();
  // RLS: zero rows deleted means the caller isn't an admin or the note is gone.
  const { data, error } = await supabase.from("member_notes").delete().eq("id", noteId).select("id");
  if (error) return fail(error.code, "deleteMemberNote");
  if (!data.length) return { status: "forbidden" };
  refresh();
  return { status: "ok" };
}
