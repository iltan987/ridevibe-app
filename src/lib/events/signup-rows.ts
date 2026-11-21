import { z } from "zod";
import type { Json } from "../supabase/database.types.ts";
import type { Counts, JoinRole } from "./join.ts";

// Parsers for the sign-up RPC rows. The generated types mark every result column non-null, but the database returns
// null for several (names of removed accounts, organiser-only fields for other viewers): parse, never trust them.

export type RosterRow = {
  profileId: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: JoinRole;
  guests: number;
  /** Organisers only: null for everyone else. */
  probation: boolean | null;
  hasEmergencyContact: boolean | null;
};

export const CHANGE_FIELDS = [
  "starts_at",
  "ends_at",
  "places",
  "limit_people",
  "limit_bikes",
  "min_cc",
  "full_members_only",
] as const;
export type ChangeField = (typeof CHANGE_FIELDS)[number];

const json: z.ZodType<Json> = z.json();
const uuid = z.uuid();

/** Whether `id` can be an event id: anything else fails the RPCs' uuid cast (22P02) instead of finding nothing. */
export function isUuid(id: string): boolean {
  return uuid.safeParse(id).success;
}

export type ChangeEntry = {
  id: string;
  changedAt: string;
  /** Timestamps inside are ISO strings with an offset: consumers parse them, never print them raw. */
  changes: { field: ChangeField; old: Json; new: Json }[];
  /** Organisers only; null for everyone else and after the author's account is gone. */
  changedByName: string | null;
};

const rosterRow = z.object({
  profile_id: z.string(),
  full_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  role: z.enum(["rider", "passenger"]),
  guests: z.number(),
  probation: z.boolean().nullable(),
  has_emergency_contact: z.boolean().nullable(),
});

const countsRow = z.object({
  event_id: z.string(),
  people: z.number(),
  bikes: z.number(),
  members: z.number(),
  guests: z.number(),
  probation: z.number(),
});

const changeRow = z.object({
  id: z.string(),
  changed_at: z.string(),
  changes: z.array(z.object({ field: z.enum(CHANGE_FIELDS), old: json, new: json })),
  changed_by_name: z.string().nullable(),
});

const authorsRow = z.object({
  created_by_name: z.string().nullable(),
  updated_by_name: z.string().nullable(),
  edited_by_other: z.boolean(),
});

export function parseRosterRows(data: unknown): RosterRow[] {
  return z
    .array(rosterRow)
    .parse(data)
    .map((r) => ({
      profileId: r.profile_id,
      fullName: r.full_name,
      avatarUrl: r.avatar_url,
      role: r.role,
      guests: r.guests,
      probation: r.probation,
      hasEmergencyContact: r.has_emergency_contact,
    }));
}

export function parseCountsRows(data: unknown): (Counts & { eventId: string })[] {
  return z
    .array(countsRow)
    .parse(data)
    .map((r) => ({
      eventId: r.event_id,
      people: r.people,
      bikes: r.bikes,
      members: r.members,
      guests: r.guests,
      probation: r.probation,
    }));
}

export function parseChangeRows(data: unknown): ChangeEntry[] {
  return z
    .array(changeRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      changedAt: r.changed_at,
      changes: r.changes,
      changedByName: r.changed_by_name,
    }));
}

/** The one row of `event_authors`, or null for an unknown event (no row). */
export function parseAuthorsRow(
  data: unknown,
): { createdByName: string | null; updatedByName: string | null; editedByOther: boolean } | null {
  const row = z.array(authorsRow).parse(data).at(0);
  if (row === undefined) return null;
  return { createdByName: row.created_by_name, updatedByName: row.updated_by_name, editedByOther: row.edited_by_other };
}

/** The largest known cc among a caller's own bikes; null when none has one. */
export function maxCc(ccs: (number | null)[]): number | null {
  return ccs.reduce<number | null>((max, cc) => (cc === null || (max !== null && max >= cc) ? max : cc), null);
}
