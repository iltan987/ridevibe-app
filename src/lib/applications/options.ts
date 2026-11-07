import type { Enums } from "@/lib/supabase/database.types";

// Allowed values for the application form. Must match the CHECK constraints
// and enums in supabase/schemas/20_applications.sql. Labels live in
// messages/*.json under Apply.options.*.

export const LANGUAGES = ["tr", "en", "other"] as const;
export const LICENSE_CLASSES = ["a1", "a2", "a", "none"] as const satisfies readonly Enums<"license_class">[];
export const RIDING_STYLES = ["city", "touring", "enduro", "sport", "cruiser", "scooter"] as const;
export const GROUP_EXPERIENCE = ["none", "some", "a_lot"] as const satisfies readonly Enums<"group_ride_experience">[];
export const HEARD_FROM = ["instagram_ad", "instagram_other", "friend", "other"] as const satisfies readonly Enums<"heard_from">[];
export const EVENT_INTERESTS = [
  "day_rides",
  "multi_day_tours",
  "camping",
  "coffee_meetups",
  "training",
  "off_road",
  "track_days",
  "maintenance",
  "charity_rides",
] as const;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

// Bump when the privacy notice text changes; stored with each consent.
export const PRIVACY_NOTICE_VERSION = "2026-11-07-draft";
