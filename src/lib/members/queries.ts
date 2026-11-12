import "server-only";
import { getCurrentUser } from "@/lib/auth/user";
import { encodeNameCursor, type NameCursor, PAGE_SIZE, splitPage } from "@/lib/pagination";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/database.types";
import type { Motorcycle } from "./format";

export type { Motorcycle };
export type IstanbulSide = Enums<"istanbul_side">;

export type DirectoryMember = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  district: string | null;
  side: IstanbulSide | null;
  birthday: { month: number; day: number } | null;
  instagram: string | null;
  motorcycles: Motorcycle[];
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
  motorcycles: (Motorcycle & { id: string })[];
};

/** One page of the member directory (active members only; the DB sorts by Turkish name and hides opted-out fields). */
export async function listDirectory({
  query,
  side,
  cursor,
}: {
  query?: string;
  side?: IstanbulSide | null;
  cursor?: NameCursor | null;
}) {
  const supabase = await createClient();
  // Generated arg types are non-nullable: omit absent args instead of passing null.
  const { data, error } = await supabase.rpc("member_directory", {
    page_size: PAGE_SIZE,
    ...(query ? { search: query } : {}),
    ...(side ? { side_filter: side } : {}),
    ...(cursor ? { after_name: cursor.name, after_id: cursor.id } : {}),
  });
  if (error) throw new Error(`listDirectory failed: ${error.code}`);

  // Generated return types are non-nullable although the columns can be null.
  const members = data.map(
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
    }),
  );
  return splitPage(members, PAGE_SIZE, (last) => encodeNameCursor({ name: last.fullName, id: last.id }));
}

/** Directory totals for the filter chips; the side counts ignore the side filter but honour the search. */
export async function countDirectory(query?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_directory_counts", query ? { search: query } : {});
  if (error) throw new Error(`countDirectory failed: ${error.code}`);
  const row = data[0];
  // bigint columns may arrive as strings or numbers
  return { total: Number(row?.total ?? 0), asian: Number(row?.asian ?? 0), european: Number(row?.european ?? 0) };
}

/** The signed-in member's own editable profile data; null when signed out or the profile row is missing. */
export async function getMyProfile(): Promise<MyProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [profile, details, bikes] = await Promise.all([
    supabase.from("profiles").select("city, district, side").eq("id", user.id).maybeSingle(),
    supabase
      .from("member_details")
      .select("birth_date, instagram, show_birthday, show_instagram, show_plates, consent_photos, consent_photos_at")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("member_motorcycles")
      .select("id, brand, model, cc")
      .eq("profile_id", user.id)
      .order("created_at")
      .order("id"),
  ]);
  if (profile.error) throw new Error(`getMyProfile failed: ${profile.error.code}`);
  if (details.error) throw new Error(`getMyProfile failed: ${details.error.code}`);
  if (bikes.error) throw new Error(`getMyProfile failed: ${bikes.error.code}`);
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
    motorcycles: bikes.data,
  };
}
