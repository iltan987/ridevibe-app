import { z } from "zod";
import { EARLIEST_BIRTH_DATE_EXCLUSIVE, isAtLeast18 } from "../birth-date.ts";
import { phoneField } from "../applications/schema.ts";
import { Constants } from "../supabase/database.types.ts";
import { ISTANBUL, isIstanbulDistrict, sideOfDistrict } from "../istanbul-districts.ts";
import { BLOOD_TYPES } from "./blood-type.ts";
import { normalizePlate } from "./plate.ts";

// Shared by the profile forms (instant feedback) and the server actions (the
// real check). Error messages are translation keys under Profile.errors.*.
export type ProfileErrorKey =
  | "required"
  | "tooLong"
  | "invalidNumber"
  | "invalidInstagram"
  | "invalidDistrict"
  | "invalidDate"
  | "tooYoung"
  | "invalidPhone"
  | "notTurkishMobile"
  | "invalidPlate"
  | "consentRequired";

const err = (key: ProfileErrorKey) => ({ error: key });

const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;
const INSTAGRAM_URL_PREFIX = /^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i;

/**
 * Accepts `handle`, `@handle` or an instagram.com profile URL (trailing `/` and
 * query string allowed). Empty → null; anything else that isn't a handle → "invalid".
 */
export function normalizeInstagram(raw: string): string | null | "invalid" {
  let value = raw.trim();
  if (!value) return null;
  if (INSTAGRAM_URL_PREFIX.test(value)) {
    value = value
      .replace(INSTAGRAM_URL_PREFIX, "")
      .replace(/[?#].*$/, "")
      .replace(/\/+$/, "");
  } else {
    value = value.replace(/^@/, "");
  }
  return INSTAGRAM_HANDLE.test(value) ? value : "invalid";
}

const optionalText = (max: number) => z.string().max(max, err("tooLong")).optional();

export const locationSchema = z
  .object({
    city_choice: z.enum(["istanbul", "other"], err("required")),
    city: optionalText(80),
    district: z.string(err("required")).trim().min(1, err("required")).max(80, err("tooLong")),
  })
  .refine((v) => v.city_choice !== "istanbul" || isIstanbulDistrict(v.district), {
    path: ["district"],
    error: "invalidDistrict" satisfies ProfileErrorKey,
    when: (payload) => payload.issues.every((i) => !["city_choice", "district"].includes(String(i.path?.[0]))),
  })
  .refine((v) => v.city_choice === "istanbul" || !!v.city?.trim(), {
    path: ["city"],
    error: "required" satisfies ProfileErrorKey,
    when: (payload) => payload.issues.every((i) => !["city_choice", "city"].includes(String(i.path?.[0]))),
  })
  .transform((v) => ({
    city: v.city_choice === "istanbul" ? ISTANBUL : v.city!.trim(),
    district: v.district,
    side: v.city_choice === "istanbul" ? sideOfDistrict(v.district) : null,
  }));

export type LocationInput = z.input<typeof locationSchema>;

export const visibilitySchema = z.object({
  instagram: z
    .string(err("invalidInstagram"))
    .max(300, err("invalidInstagram"))
    .transform((v, ctx) => {
      const handle = normalizeInstagram(v);
      if (handle === "invalid") {
        ctx.issues.push({ code: "custom", message: "invalidInstagram", input: v });
        return z.NEVER;
      }
      return handle;
    }),
  show_instagram: z.boolean(err("required")),
  show_birthday: z.boolean(err("required")),
  show_plates: z.boolean(err("required")),
});

export type VisibilityInput = z.input<typeof visibilitySchema>;

/**
 * One-time entry for members without a birth date (set_my_birth_date); same rules as the application form. Carries
 * the birthday switch so turning it off before the first save is kept.
 */
export const birthDateSchema = z.object({
  birth_date: z
    .string(err("required"))
    .min(1, err("required"))
    .pipe(z.iso.date(err("invalidDate")))
    .refine((v) => v > EARLIEST_BIRTH_DATE_EXCLUSIVE, err("invalidDate"))
    .refine((v) => isAtLeast18(v), err("tooYoung")),
  show_birthday: z.boolean(err("required")),
});

export type BirthDateInput = z.input<typeof birthDateSchema>;

const motorcycleText = z.string(err("required")).trim().min(1, err("required")).max(60, err("tooLong"));

export const motorcycleSchema = z
  .object({
    brand: motorcycleText,
    model: motorcycleText,
    // Empty string = "don't know" → undefined.
    cc: z.preprocess(
      (v) => (v === "" || v === null ? undefined : v),
      z.coerce
        .number(err("invalidNumber"))
        .int(err("invalidNumber"))
        .min(50, err("invalidNumber"))
        .max(3000, err("invalidNumber"))
        .optional(),
    ),
    // Empty = no plate shown. `plate_foreign` picks the format rules.
    plate: z.string(err("invalidPlate")).max(20, err("invalidPlate")).optional(),
    plate_foreign: z.boolean(err("required")).default(false),
  })
  .transform((v, ctx) => {
    const plate = normalizePlate(v.plate ?? "", v.plate_foreign);
    if (plate === "invalid") {
      ctx.issues.push({ code: "custom", message: "invalidPlate", input: v.plate, path: ["plate"] });
      return z.NEVER;
    }
    return { ...v, plate };
  });

export type MotorcycleInput = z.input<typeof motorcycleSchema>;

export const emergencyContactSchema = z.object({
  name: z.string(err("required")).trim().min(1, err("required")).max(80, err("tooLong")),
  relationship: z.enum(Constants.public.Enums.emergency_relationship, err("required")),
  phone: phoneField,
});

/** At most this many emergency contacts per member (the DB allows positions 1 and 2). */
export const MAX_EMERGENCY_CONTACTS = 2;

export type EmergencyContactInput = z.input<typeof emergencyContactSchema>;

export const bloodTypeSchema = z.object({
  blood_type: z.enum(BLOOD_TYPES, err("required")),
  consent: z.literal(true, err("consentRequired")),
});

export type BloodTypeInput = z.input<typeof bloodTypeSchema>;

/** Zod issues → the first error key per top-level field. */
export function firstErrorPerField(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, ProfileErrorKey> = {};
  for (const issue of issues) {
    fieldErrors[String(issue.path[0] ?? "_form")] ??= issue.message as ProfileErrorKey;
  }
  return fieldErrors;
}
