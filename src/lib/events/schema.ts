import { z } from "zod";
import type { Json } from "../supabase/database.types.ts";
import { istanbulToIso } from "./time.ts";

// Mirrors the DB checks on events / event_places (supabase/schemas). Messages are codes for the form to translate.

const text = (max: number) => z.string({ error: "required" }).trim().min(1, "required").max(max, "tooLong");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .nullable()
    .transform((v) => (v === null || v === "" ? null : v));

const optionalInt = (min: number, max: number) =>
  z
    .number({ error: "invalidNumber" })
    .int("invalidNumber")
    .min(min, "invalidNumber")
    .max(max, "invalidNumber")
    .nullable();

const wallTime = z
  .string({ error: "required" })
  .min(1, "required")
  .refine((v) => istanbulToIso(v) !== null, "invalidDate");

const VENUE_URL = /^https:\/\/(?:www\.google\.com\/maps\/place\/|yandex\.com\.tr\/maps\/org\/)[^?#\s]*$/;

const pointSchema = z.object({
  lat: z.number({ error: "invalidNumber" }).min(-90, "invalidNumber").max(90, "invalidNumber"),
  lng: z.number({ error: "invalidNumber" }).min(-180, "invalidNumber").max(180, "invalidNumber"),
});

const placeSchema = z
  .object({
    name: text(80),
    point: pointSchema.nullable(),
    venueUrl: z.string().max(500, "tooLong").regex(VENUE_URL, "invalidVenue").nullable(),
    venueLabel: optionalText(200),
  })
  .superRefine((p, ctx) => {
    if (p.point === null && p.venueUrl === null) ctx.addIssue({ code: "custom", message: "placeRequired" });
    if (p.venueLabel !== null && p.venueUrl === null) {
      ctx.addIssue({ code: "custom", message: "invalidVenue", path: ["venueLabel"] });
    }
  });

export const eventInputSchema = z
  .object({
    kind: z.enum(["meetup", "ride"]),
    title: text(80),
    side: z.enum(["asian", "european"]).nullable(),
    area: optionalText(80),
    startsAt: wallTime,
    endsAt: wallTime.nullable(),
    description: optionalText(2000),
    limitPeople: optionalInt(1, 500),
    limitBikes: optionalInt(1, 500),
    minCc: optionalInt(50, 3000),
    fullMembersOnly: z.boolean(),
    places: z.array(placeSchema),
  })
  .superRefine((e, ctx) => {
    const issue = (message: string, path: (string | number)[]) => ctx.addIssue({ code: "custom", message, path });
    if (e.kind === "meetup") {
      if (e.places.length !== 1) issue("placeCount", ["places"]);
      if (e.area !== null) issue("noAreaForMeetup", ["area"]);
    } else {
      if (e.places.length < 2 || e.places.length > 12) issue("placeCount", ["places"]);
      if (e.area === null) issue("required", ["area"]);
    }
    if (e.endsAt !== null) {
      const start = istanbulToIso(e.startsAt);
      const end = istanbulToIso(e.endsAt);
      if (start !== null && end !== null && end <= start) issue("endsBeforeStart", ["endsAt"]);
    }
  });

type EventInput = z.infer<typeof eventInputSchema>;

/** Arguments for `public.save_event` (the caller adds `p_id` when editing). */
export function toRpcArgs(input: EventInput): { p_event: Json; p_places: Json } {
  return {
    p_event: {
      kind: input.kind,
      title: input.title,
      side: input.side,
      area: input.area,
      starts_at: istanbulToIso(input.startsAt),
      ends_at: input.endsAt === null ? null : istanbulToIso(input.endsAt),
      description: input.description,
      limit_people: input.limitPeople,
      limit_bikes: input.limitBikes,
      min_cc: input.minCc,
      full_members_only: input.fullMembersOnly,
    },
    p_places: input.places.map((p) => ({
      name: p.name,
      lat: p.point?.lat ?? null,
      lng: p.point?.lng ?? null,
      venue_url: p.venueUrl,
      venue_label: p.venueLabel,
    })),
  };
}
