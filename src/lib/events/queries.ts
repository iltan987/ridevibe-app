import "server-only";
import { z } from "zod";
import { PAGE_SIZE, readAll, uniqueById } from "@/lib/pagination";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { NavPlace } from "./nav-links";

// RLS on events / event_places decides who reads (release gate: events.manage only); for anyone else these are empty.

/** A place as the pages, `navLinks` and the form use it. */
export type EventPlace = NavPlace;

export type EventSummary = {
  id: string;
  kind: Enums<"event_kind">;
  title: string;
  side: Enums<"istanbul_side"> | null;
  /** Rides only: the public district-level line. */
  area: string | null;
  startsAt: string;
  endsAt: string | null;
  status: Enums<"event_status">;
  /** In route order (a meet-up has one). */
  places: EventPlace[];
};

export type EventDetail = EventSummary & {
  description: string | null;
  limitPeople: number | null;
  limitBikes: number | null;
  minCc: number | null;
  fullMembersOnly: boolean;
  cancelReason: string | null;
  /** Null when the author's account is gone or their profile is hidden from the reader. */
  createdByName: string | null;
  updatedByName: string | null;
  updatedAt: string;
  /** The last change (edit or cancel) was made by someone other than the author. */
  editedByOther: boolean;
};

/** An event in progress stays upcoming: started less than this long ago, or not yet ended. */
const UPCOMING_GRACE_MS = 12 * 3_600_000;

const PLACES = "event_places(position, name, lat, lng, venue_url, venue_label)";
const SUMMARY_COLUMNS = `id, kind, title, side, area, starts_at, ends_at, status, ${PLACES}`;

type PlaceRow = {
  position: number;
  name: string;
  lat: number | null;
  lng: number | null;
  venue_url: string | null;
  venue_label: string | null;
};

type SummaryRow = {
  id: string;
  kind: Enums<"event_kind">;
  title: string;
  side: Enums<"istanbul_side"> | null;
  area: string | null;
  starts_at: string;
  ends_at: string | null;
  status: Enums<"event_status">;
  event_places: PlaceRow[];
};

function toPlaces(rows: PlaceRow[]): EventPlace[] {
  return rows
    .toSorted((a, b) => a.position - b.position)
    .map((p) => ({
      name: p.name,
      point: p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null,
      venueUrl: p.venue_url,
      venueLabel: p.venue_label,
    }));
}

function toSummary(row: SummaryRow): EventSummary {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    side: row.side,
    area: row.area,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    places: toPlaces(row.event_places),
  };
}

/** The boundary between upcoming and past, read once per request (after the session read: request time). */
function boundaries() {
  const now = Date.now();
  return { now: new Date(now).toISOString(), cutoff: new Date(now - UPCOMING_GRACE_MS).toISOString() };
}

/** Upcoming events (incl. cancelled ones), soonest first; everything up to LIST_CEILING. */
export async function listUpcomingEvents(): Promise<{ events: EventSummary[]; overCeiling: boolean }> {
  const supabase = await createClient();
  const { now, cutoff } = boundaries();
  const { items, overCeiling } = await readAll(async (from, to) => {
    const { data, error } = await supabase
      .from("events")
      .select(SUMMARY_COLUMNS)
      .or(`starts_at.gte.${cutoff},ends_at.gte.${now}`)
      .order("starts_at")
      .order("id")
      .range(from, to);
    if (error) throw new Error(`listUpcomingEvents failed: ${error.code}`);
    return data;
  });
  return { events: uniqueById(items).map(toSummary), overCeiling };
}

/**
 * One page (1-based, PAGE_SIZE rows) of past events, newest first, with their total. The total is a separate count
 * request: with `count: "exact"` on the page query, PostgREST answers an offset past the end (`?page=99`) with 416
 * PGRST103 instead of an empty page, and the page could not redirect to the last one.
 */
export async function listPastEvents(page: number): Promise<{ events: EventSummary[]; total: number }> {
  const supabase = await createClient();
  const { now, cutoff } = boundaries();
  const from = (page - 1) * PAGE_SIZE;
  const [rows, total] = await Promise.all([
    supabase
      .from("events")
      .select(SUMMARY_COLUMNS)
      .lt("starts_at", cutoff)
      .or(`ends_at.is.null,ends_at.lt.${now}`)
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    supabase
      .from("events")
      .select("id", { count: "exact", head: true })
      .lt("starts_at", cutoff)
      .or(`ends_at.is.null,ends_at.lt.${now}`),
  ]);
  if (rows.error) throw new Error(`listPastEvents failed: ${rows.error.code}`);
  if (total.error) throw new Error(`listPastEvents count failed: ${total.error.code}`);
  return { events: rows.data.map(toSummary), total: total.count ?? 0 };
}

const uuid = z.uuid();

export async function getEvent(id: string): Promise<EventDetail | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      `${SUMMARY_COLUMNS}, description, limit_people, limit_bikes, min_cc, full_members_only, cancel_reason, updated_at, created_by, updated_by, created_by_profile:profiles!events_created_by_fkey(full_name), updated_by_profile:profiles!events_updated_by_fkey(full_name)`,
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getEvent failed: ${error.code}`);
  if (data === null) return null;
  return {
    ...toSummary(data),
    description: data.description,
    limitPeople: data.limit_people,
    limitBikes: data.limit_bikes,
    minCc: data.min_cc,
    fullMembersOnly: data.full_members_only,
    cancelReason: data.cancel_reason,
    createdByName: data.created_by_profile?.full_name ?? null,
    updatedByName: data.updated_by_profile?.full_name ?? null,
    updatedAt: data.updated_at,
    editedByOther: data.updated_by !== null && data.updated_by !== data.created_by,
  };
}
