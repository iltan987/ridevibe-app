import { z } from "zod";
import type { Enums } from "../supabase/database.types.ts";

// Parsers for the anon-callable event RPCs (`event_teasers`, `event_preview`). Their rows hold a day and a title and
// nothing else (no time, place, count or id); the objects are strict so a widened RPC fails loudly instead of
// leaking into a public page.

export type TeaserRide = { title: string; day: string; area: string; side: Enums<"istanbul_side"> | null };
export type EventPreview = {
  kind: Enums<"event_kind">;
  title: string;
  day: string;
  area: string | null;
  cancelled: boolean;
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const teaserRow = z.strictObject({
  day,
  title: z.string(),
  area: z.string(),
  side: z.enum(["asian", "european"]).nullable(),
});

const previewRow = z.strictObject({
  kind: z.enum(["meetup", "ride"]),
  title: z.string(),
  day,
  area: z.string().nullable(),
  cancelled: z.boolean(),
});

/** Throws on a bad shape. */
export function parseTeaserRows(data: unknown): TeaserRide[] {
  return z.array(teaserRow).parse(data);
}

/** No row (unknown id, or an event not shown): null. Throws on a bad shape. */
export function parsePreviewRows(data: unknown): EventPreview | null {
  const rows = z.array(previewRow).max(1).parse(data);
  return rows[0] ?? null;
}
