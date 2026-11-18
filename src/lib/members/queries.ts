import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/user";
import { readAll, uniqueById } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Database, Enums } from "@/lib/supabase/database.types";
import type { BloodType } from "./blood-type";
import type { Motorcycle } from "./format";
import { parseMotorcycles } from "./rpc-json";

export type { Motorcycle };
export type IstanbulSide = Enums<"istanbul_side">;
type EmergencyRelationship = Enums<"emergency_relationship">;

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
  /** In ön alım; only members.manage / members.safety viewers receive such members at all. */
  probation: boolean;
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

type GeneratedDirectoryRow = Database["public"]["Functions"]["member_directory"]["Returns"][number];
type NullableDirectoryColumn =
  "avatar_url" | "birth_day" | "birth_month" | "district" | "has_emergency_contact" | "instagram" | "side";
/** A member_directory row: the generated types call every column non-null, but these are null when unset or hidden. */
type DirectoryRow = Omit<GeneratedDirectoryRow, NullableDirectoryColumn> & {
  [K in NullableDirectoryColumn]: GeneratedDirectoryRow[K] | null;
};

/**
 * Every active member for the directory (plus ön alım members for members.manage / members.safety viewers; the DB
 * sorts by Turkish name and hides opted-out fields), read in CHUNK_SIZE pages up to LIST_CEILING. The browser filters
 * and pages; the safety filters stay here because a blood filter is logged per call.
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
  // The return type annotation is what widens the generated rows to DirectoryRow (nullable columns): keep it.
  const { items, overCeiling } = await readAll(async (from, to): Promise<DirectoryRow[]> => {
    const { data, error } = await supabase.rpc("member_directory", args).range(from, to);
    if (error) throw new Error(`loadDirectory failed: ${error.code}`);
    return data;
  });

  const members = uniqueById(items).map((row): DirectoryMember => ({
    id: row.id,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    district: row.district,
    side: row.side,
    birthday: row.birth_month != null && row.birth_day != null ? { month: row.birth_month, day: row.birth_day } : null,
    instagram: row.instagram,
    motorcycles: parseMotorcycles(row.motorcycles),
    hasEmergencyContact: row.has_emergency_contact,
    probation: row.probation,
  }));
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

const clubOverview = z.object({
  total: z.number(),
  asian: z.number(),
  european: z.number(),
  initials: z.array(z.string()),
});
export type ClubOverview = z.infer<typeof clubOverview>;

/** The crowd view for ön alım members: counts and anonymous initials only (the DB refuses everyone else). */
export async function loadClubOverview(): Promise<ClubOverview> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("club_overview");
  if (error) throw new Error(`loadClubOverview failed: ${error.code}`);
  return clubOverview.parse(data[0] ?? { total: 0, asian: 0, european: 0, initials: [] });
}
