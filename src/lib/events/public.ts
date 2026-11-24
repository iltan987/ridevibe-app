import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "../supabase/public";
import { isUuid } from "./signup-rows";
import { type EventPreview, parsePreviewRows, parseTeaserRows, type TeaserRide } from "./public-rows";

/** Tag of every cached public event read; `saveEvent` / `cancelEvent` / `deleteEvent` expire it. */
export const PUBLIC_EVENTS_TAG = "events-public";

// Both readers throw on an error: a cached function stores what it returns, so an error turned into "no rides" would
// be shown for up to an hour. A throw is not stored. `cacheLife("hours")` is stale 5 min / revalidate 1 h / expire
// 1 day: a ride that passed at Istanbul midnight can stay listed for up to about an hour (accepted); planted rows
// (psql) never expire it, organiser writes do (`updateTag`).

/** Scheduled rides from today (Istanbul) on, soonest first. `total`: the database's count (rows beyond max_rows). */
export async function getTeaserRides(): Promise<{ rides: TeaserRide[]; total: number }> {
  "use cache";
  cacheTag(PUBLIC_EVENTS_TAG);
  cacheLife("hours");
  const { data, error, count } = await createPublicClient().rpc("event_teasers", undefined, { count: "exact" });
  if (error) throw new Error("event_teasers failed", { cause: error.code });
  const rides = parseTeaserRows(data);
  const total = count ?? rides.length;
  if (total > rides.length) console.error("event teasers over max_rows", { total });
  return { rides, total };
}

/**
 * The public card of one event (any kind, past or cancelled); null for an unknown id. A malformed id returns null
 * before the cache, so junk URLs make neither a request nor a cache entry.
 */
export async function getEventPreview(id: string): Promise<EventPreview | null> {
  if (!isUuid(id)) return null;
  // One cache entry per event, whatever the letter case in the URL.
  return readEventPreview(id.toLowerCase());
}

async function readEventPreview(id: string): Promise<EventPreview | null> {
  "use cache";
  cacheTag(PUBLIC_EVENTS_TAG);
  cacheLife("hours");
  const { data, error } = await createPublicClient().rpc("event_preview", { p_id: id });
  if (error) throw new Error("event_preview failed", { cause: error.code });
  return parsePreviewRows(data);
}
