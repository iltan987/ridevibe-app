import { Constants } from "../supabase/database.types.ts";

export const BLOOD_TYPES = Constants.public.Enums.blood_type;
export type BloodType = (typeof BLOOD_TYPES)[number];

/** "A+" → "A Rh+", "0-" → "0 Rh−" (U+2212 minus sign). */
export function bloodTypeLabel(type: BloodType) {
  return `${type.slice(0, -1)} Rh${type.endsWith("-") ? "−" : "+"}`;
}

/** Search-param value → enum value (exact match only), else null. */
export function parseBloodTypeParam(value: unknown): BloodType | null {
  return BLOOD_TYPES.find((type) => type === value) ?? null;
}
