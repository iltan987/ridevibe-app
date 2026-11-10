"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PRIVACY_NOTICE_VERSION } from "@/lib/applications/options";
import { createClient } from "@/lib/supabase/server";
import {
  firstErrorPerField,
  type LocationInput,
  locationSchema,
  type MotorcycleInput,
  motorcycleSchema,
  type ProfileErrorKey,
  type VisibilityInput,
  visibilitySchema,
} from "./schema";

// Public endpoints: the grants and RLS policies decide what a member may write
// (own row only; bikes only while active). We validate shapes, scope every
// write to the signed-in user and translate errors for the UI.

export type ProfileActionResult = {
  status: "ok" | "invalid" | "forbidden" | "limit" | "error";
  /** Translation keys under Profile.errors.*, only with status "invalid". */
  fieldErrors?: Record<string, ProfileErrorKey>;
};

type DbError = { code?: string; message?: string; details?: string; hint?: string };

const uuid = z.uuid();

function fail(error: DbError, where: string): ProfileActionResult {
  if (error.code === "42501") return { status: "forbidden" };
  if (error.code === "23514") {
    const text = `${error.message ?? ""} ${error.details ?? ""} ${error.hint ?? ""}`;
    return { status: text.includes("member_motorcycles_limit") ? "limit" : "invalid" };
  }
  if (error.code === "22P02") return { status: "invalid" };
  console.error(`${where} failed`, { code: error.code });
  return { status: "error" };
}

/** The verified signed-in user id (getClaims checks the JWT), or null. */
async function currentUserId() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  return { supabase, userId: error || !data?.claims ? null : data.claims.sub };
}

// Zero rows touched = RLS hid the row (not yours, not active) or it doesn't exist.
function finish(error: DbError | null, rows: unknown[] | null, where: string): ProfileActionResult {
  if (error) return fail(error, where);
  if (!rows?.length) return { status: "forbidden" };
  refresh();
  return { status: "ok" };
}

export async function updateLocation(input: LocationInput): Promise<ProfileActionResult> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error } = await supabase.from("profiles").update(parsed.data).eq("id", userId).select("id");
  return finish(error, data, "updateLocation");
}

export async function updateVisibility(input: VisibilityInput): Promise<ProfileActionResult> {
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error } = await supabase.from("member_details").update(parsed.data).eq("profile_id", userId).select("profile_id");
  return finish(error, data, "updateVisibility");
}

export async function updatePhotoConsent(consent: boolean): Promise<ProfileActionResult> {
  const parsed = z.boolean().safeParse(consent);
  if (!parsed.success) return { status: "invalid" };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  // Only an actual change writes the version, so it always belongs to the stamped consent_photos_at.
  const { data, error } = await supabase
    .from("member_details")
    .update({ consent_photos: parsed.data, consent_photos_version: PRIVACY_NOTICE_VERSION })
    .eq("profile_id", userId)
    .neq("consent_photos", parsed.data)
    .select("profile_id");
  if (error || data?.length) return finish(error, data, "updatePhotoConsent");

  // Nothing changed: either the value was already saved (ok) or the row is hidden/missing.
  const { data: current, error: readError } = await supabase
    .from("member_details")
    .select("profile_id")
    .eq("profile_id", userId)
    .eq("consent_photos", parsed.data)
    .maybeSingle();
  return finish(readError, current ? [current] : null, "updatePhotoConsent");
}

export async function addMotorcycle(input: MotorcycleInput): Promise<ProfileActionResult> {
  const parsed = motorcycleSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { brand, model, cc } = parsed.data;
  const { data, error } = await supabase
    .from("member_motorcycles")
    .insert({ profile_id: userId, brand, model, cc: cc ?? null })
    .select("id");
  return finish(error, data, "addMotorcycle");
}

export async function updateMotorcycle(id: string, input: MotorcycleInput): Promise<ProfileActionResult> {
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { status: "invalid" };
  const parsed = motorcycleSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { brand, model, cc } = parsed.data;
  const { data, error } = await supabase
    .from("member_motorcycles")
    .update({ brand, model, cc: cc ?? null })
    .eq("id", parsedId.data)
    .eq("profile_id", userId)
    .select("id");
  return finish(error, data, "updateMotorcycle");
}

export async function deleteMotorcycle(id: string): Promise<ProfileActionResult> {
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { status: "invalid" };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error } = await supabase
    .from("member_motorcycles")
    .delete()
    .eq("id", parsedId.data)
    .eq("profile_id", userId)
    .select("id");
  return finish(error, data, "deleteMotorcycle");
}
