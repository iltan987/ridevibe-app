import type { ApplicationFieldErrors } from "./schema.ts";

export type ApplyStepId = "riding" | "club" | "words" | "you";

// Which fields belong to which step of the application form (1-based order).
// `locale` and the UTM fields are hidden inputs and belong to no step.
export const APPLY_STEPS: readonly { id: ApplyStepId; fields: readonly string[] }[] = [
  {
    id: "riding",
    fields: [
      "license_class",
      "riding_years",
      "owns_motorcycle",
      "motorcycle_brand",
      "motorcycle_model",
      "motorcycle_cc",
      "riding_styles",
      "group_experience",
    ],
  },
  {
    id: "club",
    fields: ["in_other_clubs", "other_club_names", "heard_from", "referrer_name", "event_interests", "other_event_interests"],
  },
  { id: "words", fields: ["expectations", "alienating_behaviors", "conflict_handling"] },
  {
    id: "you",
    fields: [
      "full_name",
      "phone",
      "email",
      "birth_date",
      "city_choice",
      "city",
      "district",
      "instagram",
      "languages",
      "other_languages",
      "consent_privacy",
      "consent_rules",
      "consent_photos",
    ],
  },
];

export const STEP_COUNT = 4;

/** `?step=` value → 1-based step number, or null when missing/invalid. */
export function parseStep(value: string | null | undefined): number | null {
  if (!value || !/^[1-9]$/.test(value)) return null;
  const step = Number(value);
  return step <= STEP_COUNT ? step : null;
}

/** 1-based step of a field, or null for fields outside every step (locale, UTM). */
export function stepOfField(field: string): number | null {
  const index = APPLY_STEPS.findIndex((step) => step.fields.includes(field));
  return index === -1 ? null : index + 1;
}

export function errorsOfStep(fieldErrors: ApplicationFieldErrors, step: number): ApplicationFieldErrors {
  const fields = APPLY_STEPS[step - 1]?.fields ?? [];
  return Object.fromEntries(Object.entries(fieldErrors).filter(([field]) => fields.includes(field)));
}

/** Lowest step with an error; an error outside every step counts as step 1. */
export function firstStepWithError(fieldErrors: ApplicationFieldErrors): number | null {
  const steps = Object.keys(fieldErrors).map((field) => stepOfField(field) ?? 1);
  return steps.length ? Math.min(...steps) : null;
}

export const isLastStep = (step: number) => step === STEP_COUNT;
