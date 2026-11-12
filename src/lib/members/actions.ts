"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PRIVACY_NOTICE_VERSION } from "@/lib/applications/options";
import { createClient } from "@/lib/supabase/server";
import {
  type BirthDateInput,
  birthDateSchema,
  firstErrorPerField,
  type EmergencyContactInput,
  emergencyContactSchema,
  type BloodTypeInput,
  bloodTypeSchema,
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
  status: "ok" | "invalid" | "forbidden" | "limit" | "contactLimit" | "error";
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
  // unique (profile_id, position): two contacts saved at once raced for the same slot
  if (error.code === "23505") return { status: "contactLimit" };
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

/**
 * One-time entry for members without a birth date; the RPC refuses (42501) once one is stored. The birthday switch
 * (as shown on the form) is stored first, so a member who turned it off is never shown, even if a step fails.
 */
export async function setBirthDate(input: BirthDateInput): Promise<ProfileActionResult> {
  const parsed = birthDateSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error: flagError } = await supabase
    .from("member_details")
    .update({ show_birthday: parsed.data.show_birthday })
    .eq("profile_id", userId)
    .select("profile_id");
  if (flagError || !data?.length) return finish(flagError, data, "setBirthDate");

  const { error } = await supabase.rpc("set_my_birth_date", { new_date: parsed.data.birth_date });
  if (error) return fail(error, "setBirthDate");
  refresh();
  return { status: "ok" };
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

  const { brand, model, cc, plate, plate_foreign } = parsed.data;
  const { data, error } = await supabase
    .from("member_motorcycles")
    .insert({ profile_id: userId, brand, model, cc: cc ?? null, plate, plate_foreign })
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

  const { brand, model, cc, plate, plate_foreign } = parsed.data;
  const { data, error } = await supabase
    .from("member_motorcycles")
    .update({ brand, model, cc: cc ?? null, plate, plate_foreign })
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

const MAX_CONTACTS = 2;

/** Inserts at the lowest free position (1 or 2); a lost race on the same slot surfaces as 23505 → contactLimit. */
export async function addEmergencyContact(input: EmergencyContactInput): Promise<ProfileActionResult> {
  const parsed = emergencyContactSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data: existing, error: readError } = await supabase
    .from("member_emergency_contacts")
    .select("position")
    .eq("profile_id", userId);
  if (readError) return fail(readError, "addEmergencyContact");
  const taken = new Set(existing.map((c) => c.position));
  let position = 1;
  while (taken.has(position)) position++;
  if (position > MAX_CONTACTS) return { status: "contactLimit" };

  const { data, error } = await supabase
    .from("member_emergency_contacts")
    .insert({ profile_id: userId, position, ...parsed.data })
    .select("id");
  return finish(error, data, "addEmergencyContact");
}

export async function updateEmergencyContact(id: string, input: EmergencyContactInput): Promise<ProfileActionResult> {
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { status: "invalid" };
  const parsed = emergencyContactSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error } = await supabase
    .from("member_emergency_contacts")
    .update(parsed.data)
    .eq("id", parsedId.data)
    .eq("profile_id", userId)
    .select("id");
  return finish(error, data, "updateEmergencyContact");
}

export async function deleteEmergencyContact(id: string): Promise<ProfileActionResult> {
  const parsedId = uuid.safeParse(id);
  if (!parsedId.success) return { status: "invalid" };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { data, error } = await supabase
    .from("member_emergency_contacts")
    .delete()
    .eq("id", parsedId.data)
    .eq("profile_id", userId)
    .select("id");
  return finish(error, data, "deleteEmergencyContact");
}

/** The RPC stores the type with its consent (and an access-log row); it has no result rows to check. */
export async function setBloodType(input: BloodTypeInput): Promise<ProfileActionResult> {
  const parsed = bloodTypeSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", fieldErrors: firstErrorPerField(parsed.error.issues) };
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { error } = await supabase.rpc("set_my_blood_type", {
    new_type: parsed.data.blood_type,
    notice_version: PRIVACY_NOTICE_VERSION,
  });
  if (error) return fail(error, "setBloodType");
  refresh();
  return { status: "ok" };
}

export async function withdrawBloodTypeConsent(): Promise<ProfileActionResult> {
  const { supabase, userId } = await currentUserId();
  if (!userId) return { status: "forbidden" };

  const { error } = await supabase.rpc("withdraw_my_blood_type_consent");
  if (error) return fail(error, "withdrawBloodTypeConsent");
  refresh();
  return { status: "ok" };
}
