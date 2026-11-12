import { isPossiblePhoneNumber } from "libphonenumber-js";
import { z } from "zod";
import { EARLIEST_BIRTH_DATE_EXCLUSIVE, isAtLeast18 } from "../birth-date.ts";
import { ISTANBUL, isIstanbulDistrict, sideOfDistrict } from "../istanbul-districts.ts";
import type { TablesInsert } from "../supabase/database.types.ts";
import { isTurkishMobileOrForeign } from "./contact.ts";
import {
  EVENT_INTERESTS,
  GROUP_EXPERIENCE,
  HEARD_FROM,
  LANGUAGES,
  LICENSE_CLASSES,
  PRIVACY_NOTICE_VERSION,
  RIDING_STYLES,
  UTM_KEYS,
} from "./options.ts";

// Shared by the browser (instant feedback) and the server action (the real
// check). Error messages are translation keys under Apply.errors.*.
export type ApplyErrorKey =
  | "required"
  | "tooShort"
  | "tooLong"
  | "invalidEmail"
  | "invalidPhone"
  | "notTurkishMobile"
  | "invalidDate"
  | "tooYoung"
  | "invalidNumber"
  | "invalidOption"
  | "chooseAtLeastOne"
  | "mustAccept"
  | "invalidInstagram"
  | "invalidDistrict";

const err = (key: ApplyErrorKey) => ({ error: key });

const text = (min: number, max: number) =>
  z
    .string(err("required"))
    .min(min, err(min <= 1 ? "required" : "tooShort"))
    .max(max, err("tooLong"));

const optionalText = (max: number) => z.string().max(max, err("tooLong")).optional();

const yesNo = z.enum(["yes", "no"], err("required")).transform((v) => v === "yes");

const choices = <T extends readonly [string, ...string[]]>(values: T) =>
  z.array(z.enum(values, err("invalidOption"))).min(1, err("chooseAtLeastOne"));

const checkbox = z.literal("on").optional().transform((v) => v === "on");

const rule = (path: string, key: ApplyErrorKey = "required") => ({ path: [path], error: key });

// Run a cross-field rule only when the fields it depends on have no issues.
const onlyIf =
  (...fields: string[]) =>
  (payload: { issues: readonly { path?: readonly PropertyKey[] }[] }) =>
    payload.issues.every((issue) => !fields.includes(String(issue.path?.[0])));

// Turkish-friendly phone normalization to E.164 (+905321234567).
export function normalizePhone(input: string) {
  const digits = input.replace(/\D/g, "");
  if (input.trim().startsWith("+")) {
    // "+90 0546…" — a Turkish trunk 0 typed after the country code.
    return digits.startsWith("900") ? `+90${digits.slice(3)}` : `+${digits}`;
  }
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) return `+90${digits}`;
  if (digits.length === 12 && digits.startsWith("90")) return `+${digits}`;
  return `+${digits}`;
}

// Contact fields: shared by the public form and staff corrections (contactSchema).
const fullNameField = text(2, 120);

export const phoneField = z
  .string(err("required"))
  .min(1, err("required"))
  .transform(normalizePhone)
  .pipe(
    z
      .string()
      .regex(/^\+[1-9][0-9]{6,14}$/, err("invalidPhone"))
      .refine((v) => isPossiblePhoneNumber(v), err("invalidPhone"))
      // Same rule as the DB trigger: +90 numbers must be mobiles (WhatsApp).
      .refine(isTurkishMobileOrForeign, err("notTurkishMobile")),
  );

const emailField = z
  .string(err("required"))
  .min(1, err("required"))
  .max(254, err("tooLong"))
  .pipe(z.email(err("invalidEmail")))
  .transform((v) => v.toLowerCase());

const applicationFields = z.object({
  locale: z.enum(["tr", "en"]),

  full_name: fullNameField,
  phone: phoneField,
  email: emailField,
  birth_date: z
    .string(err("required"))
    .min(1, err("required"))
    .pipe(z.iso.date(err("invalidDate")))
    .refine((v) => v > EARLIEST_BIRTH_DATE_EXCLUSIVE, err("invalidDate"))
    .refine((v) => isAtLeast18(v), err("tooYoung")),
  city_choice: z.enum(["istanbul", "other"], err("required")),
  city: optionalText(80),
  district: text(1, 80),
  instagram: z
    .string()
    .transform((v) => v.replace(/^@/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9._]{1,30}$/, err("invalidInstagram")))
    .optional(),
  languages: choices(LANGUAGES),
  other_languages: optionalText(120),

  license_class: z.enum(LICENSE_CLASSES, err("required")),
  riding_years: z.coerce.number(err("invalidNumber")).int(err("invalidNumber")).min(0, err("invalidNumber")).max(70, err("invalidNumber")),
  owns_motorcycle: yesNo,
  motorcycle_brand: optionalText(60),
  motorcycle_model: optionalText(60),
  motorcycle_cc: z.coerce.number(err("invalidNumber")).int(err("invalidNumber")).min(50, err("invalidNumber")).max(3000, err("invalidNumber")).optional(),
  riding_styles: choices(RIDING_STYLES),
  group_experience: z.enum(GROUP_EXPERIENCE, err("required")),

  in_other_clubs: yesNo,
  other_club_names: optionalText(300),
  heard_from: z.enum(HEARD_FROM, err("required")),
  referrer_name: optionalText(120),
  event_interests: choices(EVENT_INTERESTS),
  other_event_interests: optionalText(300),
  expectations: text(15, 1000),
  alienating_behaviors: text(15, 1000),
  conflict_handling: text(15, 1000),

  consent_privacy: z.literal("on", err("mustAccept")).transform(() => true),
  consent_rules: z.literal("on", err("mustAccept")).transform(() => true),
  consent_photos: checkbox,

  utm_source: optionalText(200),
  utm_medium: optionalText(200),
  utm_campaign: optionalText(200),
  utm_content: optionalText(200),
  utm_term: optionalText(200),
});

/** Keys of the form object, before the cross-field rules and the transform. */
export const APPLICATION_FIELDS: readonly string[] = Object.keys(applicationFields.shape);

export const applicationSchema = applicationFields
  // "Required only if" rules. `when` lets each rule run as soon as its own
  // fields are valid, even while other fields still have errors.
  .refine((v) => v.city_choice !== "istanbul" || isIstanbulDistrict(v.district), {
    ...rule("district", "invalidDistrict"),
    when: onlyIf("city_choice", "district"),
  })
  .refine((v) => v.city_choice === "istanbul" || !!v.city, { ...rule("city"), when: onlyIf("city_choice", "city") })
  .refine((v) => !v.languages.includes("other") || !!v.other_languages, {
    ...rule("other_languages"),
    when: onlyIf("languages", "other_languages"),
  })
  .refine((v) => !v.owns_motorcycle || !!v.motorcycle_brand, {
    ...rule("motorcycle_brand"),
    when: onlyIf("owns_motorcycle", "motorcycle_brand"),
  })
  .refine((v) => !v.owns_motorcycle || !!v.motorcycle_model, {
    ...rule("motorcycle_model"),
    when: onlyIf("owns_motorcycle", "motorcycle_model"),
  })
  .refine((v) => !v.in_other_clubs || !!v.other_club_names, {
    ...rule("other_club_names"),
    when: onlyIf("in_other_clubs", "other_club_names"),
  })
  .refine((v) => !v.event_interests.includes("other") || !!v.other_event_interests, {
    ...rule("other_event_interests"),
    when: onlyIf("event_interests", "other_event_interests"),
  })
  .transform(
    (v): TablesInsert<"applications"> => ({
      locale: v.locale,
      full_name: v.full_name,
      phone: v.phone,
      email: v.email,
      birth_date: v.birth_date,
      city: v.city_choice === "istanbul" ? ISTANBUL : v.city!,
      district: v.district,
      side: v.city_choice === "istanbul" ? sideOfDistrict(v.district) : null,
      instagram: v.instagram ?? null,
      languages: v.languages,
      other_languages: v.languages.includes("other") ? v.other_languages! : null,
      license_class: v.license_class,
      riding_years: v.riding_years,
      owns_motorcycle: v.owns_motorcycle,
      // Drop bike/club/referrer details that don't apply to the chosen answer.
      motorcycle_brand: v.owns_motorcycle ? v.motorcycle_brand! : null,
      motorcycle_model: v.owns_motorcycle ? v.motorcycle_model! : null,
      motorcycle_cc: v.owns_motorcycle ? (v.motorcycle_cc ?? null) : null,
      riding_styles: v.riding_styles,
      group_experience: v.group_experience,
      in_other_clubs: v.in_other_clubs,
      other_club_names: v.in_other_clubs ? v.other_club_names! : null,
      heard_from: v.heard_from,
      // Optional: lets us credit (and later reward) the referring member.
      referrer_name: v.heard_from === "friend" ? (v.referrer_name ?? null) : null,
      event_interests: v.event_interests,
      other_event_interests: v.event_interests.includes("other") ? v.other_event_interests! : null,
      expectations: v.expectations,
      alienating_behaviors: v.alienating_behaviors,
      conflict_handling: v.conflict_handling,
      consent_privacy: v.consent_privacy,
      consent_rules: v.consent_rules,
      consent_photos: v.consent_photos,
      privacy_notice_version: PRIVACY_NOTICE_VERSION,
      utm_source: v.utm_source ?? null,
      utm_medium: v.utm_medium ?? null,
      utm_campaign: v.utm_campaign ?? null,
      utm_content: v.utm_content ?? null,
      utm_term: v.utm_term ?? null,
    }),
  );

const emailAddress = z.email();

/** Syntactically valid email (same check as the form's email field). */
export const isEmailAddress = (value: string) => emailAddress.safeParse(value.trim()).success;

export type ApplicationFieldErrors = Partial<Record<string, ApplyErrorKey>>;

export const ARRAY_FIELDS: ReadonlySet<string> = new Set(["languages", "riding_styles", "event_interests"]);

/** FormData → plain object: trims strings, drops empty ones, collects multi-selects. */
export function formDataToObject(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (ARRAY_FIELDS.has(key)) {
      out[key] = formData.getAll(key).map(String);
      continue;
    }
    const value = String(formData.get(key) ?? "").trim();
    if (value !== "") out[key] = value;
  }
  for (const key of ARRAY_FIELDS) out[key] ??= [];
  for (const key of UTM_KEYS) if (typeof out[key] === "string") out[key] = (out[key] as string).slice(0, 200);
  return out;
}

/** Zod issues → the first error key per top-level field. */
function firstErrorPerField(issues: readonly { path: readonly PropertyKey[]; message: string }[]) {
  const fieldErrors: Record<string, ApplyErrorKey> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "_form");
    fieldErrors[field] ??= (issue.message as ApplyErrorKey) || "invalidOption";
  }
  return fieldErrors;
}

/** Validate; returns the DB row or the first error key per field. */
export function validateApplication(formData: FormData) {
  const result = applicationSchema.safeParse(formDataToObject(formData));
  if (result.success) return { ok: true as const, data: result.data };

  return { ok: false as const, fieldErrors: firstErrorPerField(result.error.issues) };
}

/** Staff corrections of an application's contact fields — same rules as the public form. */
export const contactSchema = z.object({ full_name: fullNameField, phone: phoneField, email: emailField });

export type ContactValues = { full_name: string; phone: string; email: string };

/**
 * Validates only the fields that differ from `current` and returns them
 * (normalised). An old row whose phone predates the mobile rule can still get
 * a name/email correction — the DB trigger also checks the phone only when it
 * changes. Unchanged fields are never sent, so e.g. review-only staff never
 * "touch" the email of an approved application.
 */
export function validateContactChanges(current: ContactValues, input: ContactValues) {
  const changed: Partial<ContactValues> = {};
  const fullName = input.full_name.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  if (fullName !== current.full_name) changed.full_name = fullName;
  if (normalizePhone(phone) !== current.phone) changed.phone = phone;
  if (email.toLowerCase() !== current.email.toLowerCase()) changed.email = email;

  const result = contactSchema.partial().safeParse(changed);
  if (result.success) return { ok: true as const, data: result.data };

  return { ok: false as const, fieldErrors: firstErrorPerField(result.error.issues) };
}
