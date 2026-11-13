import "server-only";
import { getCurrentUser } from "@/lib/auth/user";
import { readAll } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import type { BloodType } from "./blood-type";
import type { Motorcycle } from "./format";

export type { Motorcycle };
export type IstanbulSide = Enums<"istanbul_side">;
export type EmergencyRelationship = Enums<"emergency_relationship">;

export type DirectoryMember = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  district: string | null;
  side: IstanbulSide | null;
  birthday: { month: number; day: number } | null;
  instagram: string | null;
  motorcycles: Motorcycle[];
  /** null unless the viewer may see safety data (members.safety). */
  hasEmergencyContact: boolean | null;
};

export type EmergencyContact = {
  id: string;
  position: 1 | 2;
  name: string;
  relationship: EmergencyRelationship;
  phone: string;
};

export type MyProfile = {
  city: string;
  district: string | null;
  side: IstanbulSide | null;
  birthDate: string | null;
  instagram: string | null;
  showBirthday: boolean;
  showPlates: boolean;
  showInstagram: boolean;
  consentPhotos: boolean;
  consentPhotosAt: string | null;
  motorcycles: (Motorcycle & { id: string; plateForeign: boolean })[];
  emergencyContacts: EmergencyContact[];
  bloodType: BloodType | null;
  bloodConsent: boolean;
};

/**
 * Every active member for the directory (the DB sorts by Turkish name and hides opted-out fields), read in
 * CHUNK_SIZE pages up to LIST_CEILING. The browser filters and pages; the safety filters stay here because a blood
 * filter is logged per call.
 */
export async function loadDirectory({
  bloodType,
  noContact,
}: {
  bloodType?: BloodType | null;
  noContact?: boolean;
}): Promise<{ members: DirectoryMember[]; overCeiling: boolean }> {
  const supabase = await createClient();
  // Generated arg types are non-nullable: omit absent args instead of passing null.
  const args = { ...(bloodType ? { blood_filter: bloodType } : {}), ...(noContact ? { no_contact: true } : {}) };
  const { items, overCeiling } = await readAll(async (from, to) => {
    const { data, error } = await supabase.rpc("member_directory", args).range(from, to);
    if (error) throw new Error(`loadDirectory failed: ${error.code}`);
    return data;
  });

  // Generated return types are non-nullable although the columns can be null.
  const members = items.map(
    (row): DirectoryMember => ({
      id: row.id,
      fullName: row.full_name,
      avatarUrl: (row.avatar_url as string | null) ?? null,
      district: (row.district as string | null) ?? null,
      side: (row.side as IstanbulSide | null) ?? null,
      birthday:
        row.birth_month != null && row.birth_day != null ? { month: row.birth_month, day: row.birth_day } : null,
      instagram: (row.instagram as string | null) ?? null,
      motorcycles: Array.isArray(row.motorcycles) ? (row.motorcycles as Motorcycle[]) : [],
      hasEmergencyContact: (row.has_emergency_contact as boolean | null) ?? null,
    }),
  );
  return { members, overCeiling };
}

/** The signed-in member's own editable profile data; null when signed out or the profile row is missing. */
export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [profile, details, bikes, contacts, health] = await Promise.all([
    supabase.from("profiles").select("city, district, side").eq("id", user.id).maybeSingle(),
    supabase
      .from("member_details")
      .select("birth_date, instagram, show_birthday, show_instagram, show_plates, consent_photos, consent_photos_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("member_motorcycles")
      .select("id, brand, model, cc, plate, plate_foreign")
      .eq("profile_id", user.id)
      .order("created_at")
      .order("id"),
    supabase
      .from("member_emergency_contacts")
      .select("id, position, name, relationship, phone")
      .eq("profile_id", user.id)
      .order("position"),
    supabase.from("member_health").select("blood_type, consent_blood_type").eq("profile_id", user.id).maybeSingle(),
  ]);
  if (profile.error) throw new Error(`getMyProfile failed: ${profile.error.code}`);
  if (details.error) throw new Error(`getMyProfile failed: ${details.error.code}`);
  if (bikes.error) throw new Error(`getMyProfile failed: ${bikes.error.code}`);
  if (contacts.error) throw new Error(`getMyProfile failed: ${contacts.error.code}`);
  if (health.error) throw new Error(`getMyProfile failed: ${health.error.code}`);
  if (!profile.data) return null;

  return {
    city: profile.data.city,
    district: profile.data.district,
    side: profile.data.side,
    birthDate: details.data?.birth_date ?? null,
    instagram: details.data?.instagram ?? null,
    showBirthday: details.data?.show_birthday ?? true, // schema default (opt-out)
    showInstagram: details.data?.show_instagram ?? false,
    showPlates: details.data?.show_plates ?? true, // schema default
    consentPhotos: details.data?.consent_photos ?? false,
    consentPhotosAt: details.data?.consent_photos_at ?? null,
    motorcycles: bikes.data.map(({ plate_foreign, ...bike }) => ({ ...bike, plateForeign: plate_foreign })),
    emergencyContacts: contacts.data.map((c) => ({ ...c, position: c.position === 2 ? 2 : 1 })),
    bloodType: health.data?.blood_type ?? null,
    bloodConsent: health.data?.consent_blood_type ?? false,
  };
}
