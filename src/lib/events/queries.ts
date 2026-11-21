import "server-only";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/user";
import { PAGE_SIZE, readAll, uniqueById } from "@/lib/pagination";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import type { Counts, JoinRole, Signup } from "./join";
import type { NavPlace } from "./nav-links";
import {
  type ChangeEntry,
  isUuid,
  maxCc,
  parseAuthorsRow,
  parseChangeRows,
  parseCountsRows,
  parseRosterRows,
  type RosterRow,
} from "./signup-rows";
import { UPCOMING_GRACE_MS } from "./time";

export type { ChangeEntry, ChangeField, RosterRow } from "./signup-rows";

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
  /** For the counts line and the capacity bar. */
  limitPeople: number | null;
  limitBikes: number | null;
};

export type EventDetail = EventSummary & {
  description: string | null;
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

const PLACES = "event_places(position, name, lat, lng, venue_url, venue_label)";
const SUMMARY_COLUMNS = `id, kind, title, side, area, starts_at, ends_at, status, limit_people, limit_bikes, ${PLACES}`;

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
  limit_people: number | null;
  limit_bikes: number | null;
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
    limitPeople: row.limit_people,
    limitBikes: row.limit_bikes,
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
  const [event, authors] = await Promise.all([
    supabase
      .from("events")
      .select(`${SUMMARY_COLUMNS}, description, min_cc, full_members_only, cancel_reason, updated_at`)
      .eq("id", id)
      .maybeSingle(),
    supabase.rpc("event_authors", { p_event: id }),
  ]);
  if (event.error) throw new Error(`getEvent failed: ${event.error.code}`);
  if (authors.error) throw new Error(`getEvent authors failed: ${authors.error.code}`);
  const data = event.data;
  if (data === null) return null;
  // Names come from event_authors (ön alım members can't read profiles); no row: keep the page, show no names.
  const names = parseAuthorsRow(authors.data);
  return {
    ...toSummary(data),
    description: data.description,
    minCc: data.min_cc,
    fullMembersOnly: data.full_members_only,
    cancelReason: data.cancel_reason,
    createdByName: names?.createdByName ?? null,
    updatedByName: names?.updatedByName ?? null,
    updatedAt: data.updated_at,
    editedByOther: names?.editedByOther ?? false,
  };
}

/** The roster RPC answers an unknown event with P0002; the page treats it as not found. */
class EventNotFoundError extends Error {}

/**
 * Counts per event (zeros included for existing events). Ids that aren't uuids are dropped (they would fail the whole
 * request with 22P02); nothing left: no request.
 */
export async function getEventCounts(eventIds: string[]): Promise<Map<string, Counts>> {
  const ids = eventIds.filter(isUuid);
  if (ids.length === 0) return new Map();
  const supabase = await createClient();
  // One row per event: a long list of events can pass max_rows, so read in chunks (the RPC orders by event_id).
  const { items } = await readAll(async (from, to) => {
    const { data, error } = await supabase.rpc("event_counts", { p_events: ids }).order("event_id").range(from, to);
    if (error) throw new Error(`getEventCounts failed: ${error.code}`);
    return parseCountsRows(data);
  });
  return new Map(items.map(({ eventId, ...counts }) => [eventId, counts]));
}

/**
 * Who joined, as the viewer may see it (the RPC decides: organisers everyone with flags; active members the active
 * participants while upcoming; otherwise no rows). Null: unknown event. Everything up to LIST_CEILING.
 */
export async function getRoster(id: string): Promise<{ rows: RosterRow[]; overCeiling: boolean } | null> {
  if (!uuid.safeParse(id).success) return null;
  const supabase = await createClient();
  try {
    // The RPC's own order (Turkish name, then profile id) is total: it is what the chunks page through.
    const { items, overCeiling } = await readAll(async (from, to) => {
      const { data, error } = await supabase.rpc("event_roster", { p_event: id }).range(from, to);
      if (error) {
        if (error.code === "P0002") throw new EventNotFoundError();
        throw new Error(`getRoster failed: ${error.code}`);
      }
      return parseRosterRows(data);
    });
    return { rows: uniqueByProfile(items), overCeiling };
  } catch (error) {
    if (error instanceof EventNotFoundError) return null;
    throw error;
  }
}

/** Chunks are separate requests: a row can repeat at a chunk boundary. */
function uniqueByProfile(rows: RosterRow[]): RosterRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => !seen.has(row.profileId) && seen.add(row.profileId));
}

/** What edits changed on an event, newest first, with the author's name for organisers only. */
export async function getChangeLog(id: string): Promise<{ entries: ChangeEntry[]; overCeiling: boolean }> {
  if (!uuid.safeParse(id).success) return { entries: [], overCeiling: false };
  const supabase = await createClient();
  const { items, overCeiling } = await readAll(async (from, to) => {
    const { data, error } = await supabase.rpc("event_change_log", { p_event: id }).range(from, to);
    if (error) throw new Error(`getChangeLog failed: ${error.code}`);
    return parseChangeRows(data);
  });
  return { entries: uniqueById(items), overCeiling };
}

const signupRow = z.object({ event_id: z.string(), role: z.enum(["rider", "passenger"]), guests: z.number() });

/** The caller's own sign-ups by event id (RLS: own rows, behind the gate). */
export async function getMySignups(): Promise<Map<string, Signup>> {
  const supabase = await createClient();
  const { items } = await readAll(async (from, to) => {
    const { data, error } = await supabase
      .from("event_signups")
      .select("event_id, role, guests")
      .order("event_id")
      .range(from, to);
    if (error) throw new Error(`getMySignups failed: ${error.code}`);
    return z.array(signupRow).parse(data);
  });
  return new Map(
    items.map((r): [string, Signup] => [r.event_id, { role: r.role satisfies JoinRole, guests: r.guests }]),
  );
}

/**
 * What the join rules need to know about the caller: their own bikes and emergency contacts, read with an explicit
 * `profile_id` filter (RLS alone would also return other members' rows to `members.manage` holders).
 */
export async function getMyJoinContext(): Promise<{
  probation: boolean;
  maxCc: number | null;
  hasEmergencyContact: boolean;
}> {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  if (user === null) return { probation: false, maxCc: null, hasEmergencyContact: false };
  // Explicit own-row filters: RLS lets `members.manage` holders read every member's bikes.
  const [bikes, contacts] = await Promise.all([
    supabase.from("member_motorcycles").select("cc").eq("profile_id", user.id).not("cc", "is", null),
    supabase.from("member_emergency_contacts").select("id", { count: "exact", head: true }).eq("profile_id", user.id),
  ]);
  if (bikes.error) throw new Error(`getMyJoinContext bikes failed: ${bikes.error.code}`);
  if (contacts.error) throw new Error(`getMyJoinContext contacts failed: ${contacts.error.code}`);
  return {
    probation: user.profile?.status === "probation",
    maxCc: maxCc(bikes.data.map((b) => b.cc)),
    hasEmergencyContact: (contacts.count ?? 0) > 0,
  };
}
