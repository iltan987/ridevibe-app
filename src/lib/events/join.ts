import { z } from "zod";

export const MAX_GUESTS = 3;

export type JoinRole = "rider" | "passenger";
export type Signup = { role: JoinRole; guests: number };
export type Counts = { people: number; bikes: number; members: number; guests: number; probation: number };
export type JoinReason = "started" | "cancelled" | "peopleLimit" | "bikeLimit" | "minCc" | "fullMembersOnly";

export const joinSchema = z.object({
  role: z.enum(["rider", "passenger"]),
  guests: z.int().min(0).max(MAX_GUESTS),
});

type JoinEvent = {
  status: "scheduled" | "cancelled";
  startsAt: string;
  limitPeople: number | null;
  limitBikes: number | null;
  minCc: number | null;
  fullMembersOnly: boolean;
};

const people = (s: Signup | null) => (s ? 1 + s.guests : 0);
const bikes = (s: Signup | null) => (s?.role === "rider" ? 1 : 0);

/**
 * Why `next` would be refused, or null. Mirrors `join_event` (same rules, same order, including "don't make it
 * worse": a rule refuses only a change that raises the caller's own footprint on it). `counts` include `mine`, so
 * the own footprint is subtracted first. `maxCc`: the largest cc among the caller's bikes (null: none with a cc).
 * The UI explains and disables with it; the database still decides.
 */
export function checkJoin(input: {
  event: JoinEvent;
  counts: Counts;
  mine: Signup | null;
  next: Signup;
  probation: boolean;
  maxCc: number | null;
  now: number;
}): JoinReason | null {
  const { event, counts, mine, next, probation, maxCc, now } = input;
  if (event.status === "cancelled") return "cancelled";
  if (now >= Date.parse(event.startsAt)) return "started";
  if (event.fullMembersOnly && mine === null && probation) return "fullMembersOnly";
  if (event.minCc !== null && bikes(next) > bikes(mine) && (maxCc === null || maxCc < event.minCc)) return "minCc";
  if (event.limitPeople !== null && people(next) > people(mine)) {
    if (counts.people - people(mine) + people(next) > event.limitPeople) return "peopleLimit";
  }
  if (event.limitBikes !== null && bikes(next) > bikes(mine)) {
    if (counts.bikes - bikes(mine) + bikes(next) > event.limitBikes) return "bikeLimit";
  }
  return null;
}

const REASONS: Record<string, JoinReason | "hasSignups"> = {
  started: "started",
  cancelled: "cancelled",
  people_limit: "peopleLimit",
  bike_limit: "bikeLimit",
  min_cc: "minCc",
  full_members_only: "fullMembersOnly",
  has_signups: "hasSignups",
};

/** Maps the `hint` of a P0001 refusal from the event RPCs; unknown or missing: null. */
export function reasonFromHint(hint: string | undefined): JoinReason | "hasSignups" | null {
  if (hint === undefined) return null;
  return Object.hasOwn(REASONS, hint) ? (REASONS[hint] ?? null) : null;
}

export type JoinActionResult =
  | { status: "ok" }
  | { status: "refused"; reason: JoinReason }
  | { status: "invalid" | "forbidden" | "notFound" | "error" };

/** Maps the error of `join_event` / `leave_event` to the action result (`has_signups` is never raised by them). */
export function joinResult(error: { code?: string; hint?: string } | null): JoinActionResult {
  if (!error) return { status: "ok" };
  if (error.code === "P0001") {
    const reason = reasonFromHint(error.hint);
    return reason === null || reason === "hasSignups" ? { status: "error" } : { status: "refused", reason };
  }
  if (error.code === "42501") return { status: "forbidden" };
  if (error.code === "P0002") return { status: "notFound" };
  if (error.code === "22023" || error.code === "22P02") return { status: "invalid" };
  return { status: "error" };
}

/** The numbers of the counts line ("18" or "18 / 20"); messages wrap them. `over`: a count passes its limit. */
export function countsLine(
  counts: Counts,
  limits: { people: number | null; bikes: number | null },
): { people: string; bikes: string; over: boolean } {
  const part = (n: number, limit: number | null) => (limit === null ? `${n}` : `${n} / ${limit}`);
  return {
    people: part(counts.people, limits.people),
    bikes: part(counts.bikes, limits.bikes),
    over:
      (limits.people !== null && counts.people > limits.people) ||
      (limits.bikes !== null && counts.bikes > limits.bikes),
  };
}
