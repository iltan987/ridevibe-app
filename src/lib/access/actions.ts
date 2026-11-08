"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { MEMBER_STATUSES } from "./queries";

// Server Actions are public endpoints: the database (RLS, grants and the
// security-definer RPCs) decides what each caller may do. We only validate
// shapes and translate errors for the UI.

export type AccessActionResult = { status: "ok" | "forbidden" | "invalid" | "duplicate" | "error" };

const uuid = z.uuid();
const roleName = z.string().trim().min(1).max(60);

function fail(code: string | undefined, where: string): AccessActionResult {
  if (code === "42501") return { status: "forbidden" };
  if (code === "23505") return { status: "duplicate" };
  if (code === "P0002" || code === "23503" || code === "23514") return { status: "invalid" };
  console.error(`${where} failed`, { code });
  return { status: "error" };
}

async function done(error: { code?: string } | null, where: string): Promise<AccessActionResult> {
  if (error) return fail(error.code, where);
  refresh();
  return { status: "ok" };
}

export async function setMemberStatus(targetId: string, status: string): Promise<AccessActionResult> {
  const input = z.object({ targetId: uuid, status: z.enum(MEMBER_STATUSES) }).safeParse({ targetId, status });
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_status", {
    target_id: input.data.targetId,
    new_status: input.data.status,
  });
  return done(error, "setMemberStatus");
}

/** `roleId` null = regular member without a role. */
export async function setMemberRole(targetId: string, roleId: string | null): Promise<AccessActionResult> {
  const input = z.object({ targetId: uuid, roleId: uuid.nullable() }).safeParse({ targetId, roleId });
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    target_id: input.data.targetId,
    // Generated types say `string`; SQL accepts null (= no role).
    new_role_id: input.data.roleId as string,
  });
  return done(error, "setMemberRole");
}

export async function createRole(name: string): Promise<AccessActionResult> {
  const input = roleName.safeParse(name);
  if (!input.success) return { status: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({ name: input.data });
  return done(error, "createRole");
}

/** Renames a custom role and replaces its permissions. */
export async function updateRole(roleId: string, name: string, permissions: string[]): Promise<AccessActionResult> {
  const input = z
    .object({ roleId: uuid, name: roleName, permissions: z.array(z.enum(PERMISSIONS)) })
    .safeParse({ roleId, name, permissions });
  if (!input.success) return { status: "invalid" };
  const { data } = input;
  const supabase = await createClient();

  // RLS: zero rows updated means the role is the admin role, missing, or the
  // caller isn't an admin.
  const { data: renamed, error: renameError } = await supabase
    .from("roles")
    .update({ name: data.name })
    .eq("id", data.roleId)
    .select("id");
  if (renameError) return fail(renameError.code, "updateRole");
  if (!renamed.length) return { status: "forbidden" };

  const keep = [...new Set(data.permissions)];
  let removal = supabase.from("role_permissions").delete().eq("role_id", data.roleId);
  if (keep.length) removal = removal.not("permission", "in", `(${keep.join(",")})`);
  const { error: removeError } = await removal;
  if (removeError) return fail(removeError.code, "updateRole");

  if (keep.length) {
    const { error: addError } = await supabase
      .from("role_permissions")
      .upsert(
        keep.map((permission) => ({ role_id: data.roleId, permission })),
        { onConflict: "role_id,permission", ignoreDuplicates: true },
      );
    if (addError) return fail(addError.code, "updateRole");
  }

  refresh();
  return { status: "ok" };
}

/** Holders of the role become regular members (ON DELETE SET NULL). */
export async function deleteRole(roleId: string): Promise<AccessActionResult> {
  if (!uuid.safeParse(roleId).success) return { status: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.from("roles").delete().eq("id", roleId).select("id");
  if (error) return fail(error.code, "deleteRole");
  if (!data.length) return { status: "forbidden" };
  refresh();
  return { status: "ok" };
}
