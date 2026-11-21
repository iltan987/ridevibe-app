import type { z } from "zod";
import type { LatLng, ParsedPlace } from "./place-input.ts";
import type { eventInputSchema } from "./schema.ts";
import { isoToIstanbul } from "./time.ts";

// State of the create/edit form and its mapping to the schema input (`eventInputSchema`). Dependency-free for
// `node --test`. The form keeps a ride's whole place list while it shows a meet-up, so switching the kind back and
// forth loses nothing; only what is shown is sent.

export const MAX_STOPS = 10;

/** Same cap as a place name in the schema. */
const NAME_MAX = 80;

export type PlaceError = "unreadable" | "forbidden" | "error";

export type PlaceDraft = {
  /** React key and element ids; the async paste result finds its place by it (a removed place ignores it). */
  key: string;
  name: string;
  point: LatLng | null;
  venue: { url: string; label: string | null } | null;
  /**
   * The paste box. Privacy: a pasted route link holds the sharer's own position, so the text lives only here (the
   * box), is cleared once it resolves and never goes into the event.
   */
  paste: string;
  pending: boolean;
  error: PlaceError | null;
};

export type EventFormState = {
  kind: "meetup" | "ride";
  title: string;
  side: "asian" | "european" | null;
  area: string;
  /** Istanbul wall time "YYYY-MM-DDTHH:mm" (`datetime-local`), "" when empty. */
  startsAt: string;
  endsAt: string;
  description: string;
  /** As typed: parsed on the way out, so the schema can say what is wrong. */
  limitPeople: string;
  limitBikes: string;
  minCc: string;
  fullMembersOnly: boolean;
  /** The meet-up's place, or the ride's start. */
  start: PlaceDraft;
  stops: PlaceDraft[];
  finish: PlaceDraft;
  /** "Başlangıca dönüş": the ride ends where it started; the start is sent as the finish. */
  loop: boolean;
};

export type EventFormInput = z.input<typeof eventInputSchema>;

/** An event as stored (`EventDetail` from the queries, times in ISO). */
export type StoredEvent = {
  kind: "meetup" | "ride";
  title: string;
  side: "asian" | "european" | null;
  area: string | null;
  startsAt: string;
  endsAt: string | null;
  description: string | null;
  limitPeople: number | null;
  limitBikes: number | null;
  minCc: number | null;
  fullMembersOnly: boolean;
  places: { name: string; point: LatLng | null; venueUrl: string | null; venueLabel: string | null }[];
};

export function emptyPlace(key: string): PlaceDraft {
  return { key, name: "", point: null, venue: null, paste: "", pending: false, error: null };
}

/** The create form: a ride (the club's main event) with an empty start and finish. */
export function newEventForm(): EventFormState {
  return {
    kind: "ride",
    title: "",
    side: null,
    area: "",
    startsAt: "",
    endsAt: "",
    description: "",
    limitPeople: "",
    limitBikes: "",
    minCc: "",
    fullMembersOnly: false,
    start: emptyPlace("start"),
    stops: [],
    finish: emptyPlace("finish"),
    loop: false,
  };
}

type StoredPlace = StoredEvent["places"][number];

function toDraft(key: string, p: StoredPlace): PlaceDraft {
  return {
    ...emptyPlace(key),
    name: p.name,
    point: p.point,
    venue: p.venueUrl === null ? null : { url: p.venueUrl, label: p.venueLabel },
  };
}

const samePlace = (a: StoredPlace, b: StoredPlace) =>
  a.name === b.name &&
  a.point?.lat === b.point?.lat &&
  a.point?.lng === b.point?.lng &&
  a.venueUrl === b.venueUrl &&
  a.venueLabel === b.venueLabel;

/** The edit form, prefilled. A ride whose finish repeats its start opens with "Başlangıca dönüş" ticked. */
export function eventToForm(event: StoredEvent): EventFormState {
  const first = event.places.at(0);
  const rest = event.places.slice(1);
  const last = rest.at(-1);
  const ride = event.kind === "ride" && last !== undefined;
  return {
    kind: event.kind,
    title: event.title,
    side: event.side,
    area: event.area ?? "",
    startsAt: isoToIstanbul(event.startsAt),
    endsAt: event.endsAt === null ? "" : isoToIstanbul(event.endsAt),
    description: event.description ?? "",
    limitPeople: event.limitPeople?.toString() ?? "",
    limitBikes: event.limitBikes?.toString() ?? "",
    minCc: event.minCc?.toString() ?? "",
    fullMembersOnly: event.fullMembersOnly,
    start: first === undefined ? emptyPlace("start") : toDraft("start", first),
    stops: ride ? rest.slice(0, -1).map((p, i) => toDraft(`stop-${i}`, p)) : [],
    finish: ride ? toDraft("finish", last) : emptyPlace("finish"),
    loop: ride && first !== undefined && samePlace(first, last),
  };
}

/** "" → null; whole numbers → the number; anything else → NaN, which the schema reports as `invalidNumber`. */
function count(text: string): number | null {
  const t = text.trim();
  if (t === "") return null;
  return /^\d+$/.test(t) ? Number(t) : Number.NaN;
}

function toPlace(p: PlaceDraft): EventFormInput["places"][number] {
  // Ruling R4: an empty slot is null, never "".
  return { name: p.name, point: p.point, venueUrl: p.venue?.url ?? null, venueLabel: p.venue?.label ?? null };
}

export function toEventInput(s: EventFormState): EventFormInput {
  return {
    kind: s.kind,
    title: s.title,
    side: s.side,
    area: s.kind === "ride" ? s.area : null,
    startsAt: s.startsAt,
    endsAt: s.endsAt === "" ? null : s.endsAt,
    description: s.description,
    limitPeople: count(s.limitPeople),
    limitBikes: count(s.limitBikes),
    minCc: count(s.minCc),
    fullMembersOnly: s.fullMembersOnly,
    places:
      s.kind === "meetup"
        ? [toPlace(s.start)]
        : [toPlace(s.start), ...s.stops.map(toPlace), toPlace(s.loop ? s.start : s.finish)],
  };
}

export type ShownPlace = {
  place: PlaceDraft;
  role: "meetup" | "start" | "stop" | "finish";
  /** 1-based stop number (0 for other roles). */
  stop: number;
  /** Position in the sent place list: schema issues name it (`places.<index>.name`). */
  index: number;
};

/** The places the form shows, in route order (a loop's finish is the start, not shown twice). */
export function shownPlaces(s: EventFormState): ShownPlace[] {
  if (s.kind === "meetup") return [{ place: s.start, role: "meetup", stop: 0, index: 0 }];
  const stops = s.stops.map((place, i): ShownPlace => ({ place, role: "stop", stop: i + 1, index: i + 1 }));
  const shown: ShownPlace[] = [{ place: s.start, role: "start", stop: 0, index: 0 }, ...stops];
  if (!s.loop) shown.push({ place: s.finish, role: "finish", stop: 0, index: s.stops.length + 1 });
  return shown;
}

/** Saving waits until every shown place has a point or a venue and no paste is still being read. */
export function placesStatus(s: EventFormState): { missing: boolean; pending: boolean } {
  const shown = shownPlaces(s).map(({ place }) => place);
  return {
    missing: shown.some((p) => p.point === null && p.venue === null),
    pending: shown.some((p) => p.pending),
  };
}

export function addStop(s: EventFormState, key: string): EventFormState {
  if (s.stops.length >= MAX_STOPS) return s;
  return { ...s, stops: [...s.stops, emptyPlace(key)] };
}

export function removeStop(s: EventFormState, key: string): EventFormState {
  if (!s.stops.some((p) => p.key === key)) return s;
  return { ...s, stops: s.stops.filter((p) => p.key !== key) };
}

export function moveStop(s: EventFormState, key: string, delta: -1 | 1): EventFormState {
  const from = s.stops.findIndex((p) => p.key === key);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= s.stops.length) return s;
  const stops = [...s.stops];
  [stops[from], stops[to]] = [stops[to], stops[from]];
  return { ...s, stops };
}

/**
 * Ticked: the start stands in for the finish. Unticked: the finish starts as a copy of the start (under a new key,
 * so a paste still being read for the old finish can't land in it).
 */
export function setLoop(s: EventFormState, on: boolean, key: string): EventFormState {
  if (on) return { ...s, loop: true };
  const { name, point, venue } = s.start;
  return { ...s, loop: false, finish: { ...emptyPlace(key), name, point, venue } };
}

/** Applies `fn` to the place with `key` (start, a stop or the finish); nothing changes when it is gone. */
export function updatePlace(s: EventFormState, key: string, fn: (p: PlaceDraft) => PlaceDraft): EventFormState {
  if (s.start.key === key) return { ...s, start: fn(s.start) };
  if (s.finish.key === key) return { ...s, finish: fn(s.finish) };
  if (s.stops.some((p) => p.key === key)) {
    return { ...s, stops: s.stops.map((p) => (p.key === key ? fn(p) : p)) };
  }
  return s;
}

/**
 * Puts a read place into its slot (a new pin replaces the old one, likewise a venue) and empties the paste box. An
 * empty name takes the venue's own name (a Google label's part before the first comma).
 */
export function withResolved(p: PlaceDraft, parsed: ParsedPlace): PlaceDraft {
  const done = { ...p, paste: "", pending: false, error: null };
  if (parsed.kind === "point") return { ...done, point: parsed.point };
  const venueName = parsed.label?.split(",")[0]?.trim().slice(0, NAME_MAX) ?? "";
  return {
    ...done,
    venue: { url: parsed.url, label: parsed.label },
    name: p.name.trim() === "" ? venueName : p.name,
  };
}

const PLACE_BOX = /^places\.\d+$/;

/**
 * The error code for one field key of `issueMap`. A place's paste box (`places.<i>`) also answers for the place's slot
 * issues (`places.<i>.venueUrl`, `places.<i>.point.lat`…): they come from what was pasted. The name has its own key.
 */
export function errorAt(map: Readonly<Partial<Record<string, string>>>, key: string): string | undefined {
  if (map[key] !== undefined || !PLACE_BOX.test(key)) return map[key];
  const sub = Object.keys(map).find((k) => k.startsWith(`${key}.`) && k !== `${key}.name`);
  return sub === undefined ? undefined : map[sub];
}

/** Schema issues → the first message (an error code) per dotted path ("places.2.name"). */
export function issueMap(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map((part) => (typeof part === "symbol" ? "" : String(part))).join(".");
    map[key] ??= issue.message;
  }
  return map;
}
