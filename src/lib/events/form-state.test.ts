// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addStop,
  emptyPlace,
  errorAt,
  errorMessageKey,
  eventToForm,
  type EventFormState,
  issueMap,
  MAX_STOPS,
  moveStop,
  newEventForm,
  type PlaceDraft,
  placesStatus,
  removeSlot,
  removeStop,
  setLoop,
  settleResolve,
  shownPlaces,
  startResolve,
  toEventInput,
  typePaste,
  updatePlace,
} from "./form-state.ts";
import { eventInputSchema } from "./schema.ts";

const POINT = { lat: 41.032201, lng: 29.022904 };
const VENUE = { url: "https://www.google.com/maps/place/Starbucks,+Moda", label: "Starbucks, Moda" };

const place = (key: string, name: string, extra: Partial<PlaceDraft> = {}): PlaceDraft => ({
  ...emptyPlace(key),
  name,
  point: POINT,
  ...extra,
});

function filledRide(): EventFormState {
  return {
    ...newEventForm(),
    title: "Ağva kahvaltı sürüşü",
    area: "Üsküdar → Ağva",
    startsAt: "2026-11-22T08:30",
    start: place("start", "Kız Kulesi"),
    finish: place("finish", "Ağva", { point: null, venue: VENUE }),
  };
}

test("a new form is an empty ride with a start and a finish", () => {
  const s = newEventForm();
  assert.equal(s.kind, "ride");
  assert.equal(s.loop, false);
  assert.deepEqual(s.stops, []);
  assert.deepEqual(s.start, emptyPlace("start"));
  assert.deepEqual(s.finish, emptyPlace("finish"));
  assert.deepEqual(emptyPlace("x"), {
    key: "x",
    name: "",
    point: null,
    venue: null,
    paste: "",
    pending: null,
    error: null,
    filled: null,
  });
});

test("toEventInput maps a ride: start, stops, finish; empty texts and numbers become null", () => {
  const s = addStop(filledRide(), "s1");
  const withStop = updatePlace(s, "s1", (p) => ({ ...p, name: "Şile", point: { lat: 41.17, lng: 29.6 } }));
  const input = toEventInput({ ...withStop, limitPeople: " 20 ", minCc: "" });
  assert.deepEqual(input, {
    kind: "ride",
    title: "Ağva kahvaltı sürüşü",
    side: null,
    area: "Üsküdar → Ağva",
    startsAt: "2026-11-22T08:30",
    endsAt: null,
    description: "",
    limitPeople: 20,
    limitBikes: null,
    minCc: null,
    fullMembersOnly: false,
    places: [
      { name: "Kız Kulesi", point: POINT, venueUrl: null, venueLabel: null },
      { name: "Şile", point: { lat: 41.17, lng: 29.6 }, venueUrl: null, venueLabel: null },
      { name: "Ağva", point: null, venueUrl: VENUE.url, venueLabel: VENUE.label },
    ],
  });
  assert.equal(eventInputSchema.safeParse(input).success, true);
});

test("toEventInput: a meet-up sends only its first place and no area", () => {
  const input = toEventInput({ ...filledRide(), kind: "meetup" });
  assert.equal(input.area, null);
  assert.deepEqual(input.places, [{ name: "Kız Kulesi", point: POINT, venueUrl: null, venueLabel: null }]);
  assert.equal(eventInputSchema.safeParse(input).success, true);
});

test("toEventInput: an empty slot is null, never an empty string (ruling R4)", () => {
  const input = toEventInput({ ...filledRide(), start: place("start", "A", { point: null }) });
  assert.deepEqual(input.places[0], { name: "A", point: null, venueUrl: null, venueLabel: null });
});

test("toEventInput: a number that isn't a whole number fails the schema as invalidNumber", () => {
  for (const value of ["abc", "1.5", "-3", "1e3"]) {
    const result = eventInputSchema.safeParse(toEventInput({ ...filledRide(), limitBikes: value }));
    assert.equal(result.success, false, value);
    assert.deepEqual(issueMap(result.error.issues), { limitBikes: "invalidNumber" }, value);
  }
});

test("toEventInput: a loop sends the start again as the finish", () => {
  const input = toEventInput(setLoop(filledRide(), true, "f2"));
  assert.equal(input.places.length, 2);
  assert.deepEqual(input.places[1], input.places[0]);
});

test("setLoop: unticking keeps a finish that has a name or a slot", () => {
  const on = setLoop(filledRide(), true, "unused");
  assert.equal(on.loop, true);
  const off = setLoop(on, false, "f2");
  assert.equal(off.loop, false);
  assert.deepEqual(off.finish, filledRide().finish);
  const named = { ...on, finish: { ...emptyPlace("finish"), name: "Ağva" } };
  assert.deepEqual(setLoop(named, false, "f2").finish, named.finish);
  const pinned = { ...on, finish: { ...emptyPlace("finish"), point: POINT } };
  assert.deepEqual(setLoop(pinned, false, "f2").finish, pinned.finish);
});

test("setLoop: unticking over an empty finish copies the start into a fresh slot", () => {
  const on = setLoop({ ...filledRide(), finish: { ...emptyPlace("finish"), name: "  " } }, true, "unused");
  const start = { ...on.start, pending: 7, paste: "x", error: "unreadable" as const, filled: "point" as const };
  const off = setLoop({ ...on, start }, false, "f2");
  assert.deepEqual(off.finish, { ...emptyPlace("f2"), name: "Kız Kulesi", point: POINT });
});

test("addStop stops at MAX_STOPS", () => {
  let s = newEventForm();
  for (let i = 0; i < MAX_STOPS + 2; i++) s = addStop(s, `s${i}`);
  assert.equal(s.stops.length, MAX_STOPS);
  assert.deepEqual(
    s.stops.map((p) => p.key),
    Array.from({ length: MAX_STOPS }, (_, i) => `s${i}`),
  );
});

test("moveStop moves within bounds; removeStop removes by key", () => {
  const s = addStop(addStop(addStop(newEventForm(), "a"), "b"), "c");
  const keys = (x: EventFormState) => x.stops.map((p) => p.key).join("");
  assert.equal(keys(moveStop(s, "b", -1)), "bac");
  assert.equal(keys(moveStop(s, "b", 1)), "acb");
  assert.equal(keys(moveStop(s, "a", -1)), "abc");
  assert.equal(keys(moveStop(s, "c", 1)), "abc");
  assert.equal(keys(removeStop(s, "b")), "ac");
  assert.equal(keys(removeStop(s, "zz")), "abc");
});

test("updatePlace finds the start, a stop or the finish; an unknown key changes nothing", () => {
  const s = addStop(newEventForm(), "s1");
  const rename = (key: string) => updatePlace(s, key, (p) => ({ ...p, name: key }));
  assert.equal(rename("start").start.name, "start");
  assert.equal(rename("s1").stops[0]?.name, "s1");
  assert.equal(rename("finish").finish.name, "finish");
  assert.deepEqual(rename("gone"), s);
});

test("shownPlaces: roles and their index in the sent place list", () => {
  const ride = addStop(addStop(newEventForm(), "a"), "b");
  assert.deepEqual(
    shownPlaces(ride).map(({ role, stop, index, place: p }) => [role, stop, index, p.key]),
    [
      ["start", 0, 0, "start"],
      ["stop", 1, 1, "a"],
      ["stop", 2, 2, "b"],
      ["finish", 0, 3, "finish"],
    ],
  );
  assert.deepEqual(
    shownPlaces(setLoop(ride, true, "x")).map(({ role }) => role),
    ["start", "stop", "stop"],
  );
  assert.deepEqual(
    shownPlaces({ ...ride, kind: "meetup" }).map(({ role, index }) => [role, index]),
    [["meetup", 0]],
  );
});

test("placesStatus: a shown place without a slot or a pending paste blocks saving", () => {
  assert.deepEqual(placesStatus(filledRide()), { missing: false, pending: false });
  assert.deepEqual(placesStatus(newEventForm()), { missing: true, pending: false });
  // The hidden finish of a meet-up or a loop doesn't count.
  const meetup = { ...filledRide(), kind: "meetup" as const, finish: emptyPlace("finish") };
  assert.deepEqual(placesStatus(meetup), { missing: false, pending: false });
  assert.deepEqual(placesStatus(setLoop(meetup, true, "x")), { missing: false, pending: false });
  const pending = updatePlace(filledRide(), "finish", (p) => ({ ...p, pending: 3 }));
  assert.deepEqual(placesStatus(pending), { missing: false, pending: true });
});

/** Reads `outcome` into `p` as the newest request. */
const read = (p: PlaceDraft, outcome: Parameters<typeof settleResolve>[2]) =>
  settleResolve(startResolve(p, "pasted", 9), 9, outcome);

test("settleResolve fills one slot, clears the paste box and the error, remembers what it filled", () => {
  const typing: PlaceDraft = { ...emptyPlace("p"), paste: "41.0322, 29.0229", pending: 1, error: "unreadable" };
  const pinned = settleResolve(typing, 1, { kind: "point", point: POINT });
  assert.deepEqual(pinned, { ...emptyPlace("p"), point: POINT, filled: "point" });
  // A venue fills its own slot and keeps the point; an empty name takes the venue's name.
  const both = read(pinned, { kind: "venue", url: VENUE.url, label: "İBB Paşalimanı Sosyal Tesisi, Üsküdar" });
  assert.deepEqual(both.point, POINT);
  assert.deepEqual(both.venue, { url: VENUE.url, label: "İBB Paşalimanı Sosyal Tesisi, Üsküdar" });
  assert.equal(both.name, "İBB Paşalimanı Sosyal Tesisi");
  assert.equal(both.filled, "venue");
  // A typed name stays; a new pin replaces the old one.
  const named = read({ ...pinned, name: "Paşalimanı" }, { kind: "venue", url: VENUE.url, label: "X, Y" });
  assert.equal(named.name, "Paşalimanı");
  assert.deepEqual(read(both, { kind: "point", point: { lat: 1, lng: 2 } }).point, { lat: 1, lng: 2 });
  // Yandex venues have no label: the name stays empty; a long label is cut to the 80-char name limit.
  assert.equal(read(emptyPlace("p"), { kind: "venue", url: VENUE.url, label: null }).name, "");
  const long = read(emptyPlace("p"), { kind: "venue", url: VENUE.url, label: "x".repeat(120) });
  assert.equal(long.name.length, 80);
});

test("settleResolve: only the answer to the newest request lands; typing drops a pending one", () => {
  const first = startResolve({ ...emptyPlace("p"), error: "error", filled: "venue" }, "41.1, 29.1", 1);
  assert.deepEqual(first, { ...emptyPlace("p"), paste: "41.1, 29.1", pending: 1 });
  const second = startResolve(first, "41.2, 29.2", 2);
  // The older answer arrives late: ignored.
  assert.equal(settleResolve(second, 1, { kind: "point", point: POINT }), second);
  assert.deepEqual(settleResolve(second, 2, { kind: "point", point: POINT }).point, POINT);
  // Typing clears the token: the answer to the text before is dropped, the new text waits for blur.
  const typed = typePaste({ ...first, error: "unreadable" }, "41.3, 29.3");
  assert.deepEqual(typed, { ...emptyPlace("p"), paste: "41.3, 29.3" });
  assert.equal(settleResolve(typed, 1, { kind: "point", point: POINT }), typed);
  // A failure keeps the text for fixing and shows the error.
  assert.deepEqual(settleResolve(first, 1, "unreadable"), {
    ...emptyPlace("p"),
    paste: "41.1, 29.1",
    error: "unreadable",
  });
});

test("removeSlot clears the slot and forgets the announcement of that slot only", () => {
  const p: PlaceDraft = { ...emptyPlace("p"), point: POINT, venue: VENUE, filled: "point" };
  assert.deepEqual(removeSlot(p, "point"), { ...p, point: null, filled: null });
  assert.deepEqual(removeSlot(p, "venue"), { ...p, venue: null });
});

test("eventToForm: a ride with stops, Istanbul wall times, numbers as text", () => {
  const s = eventToForm({
    kind: "ride",
    title: "Şile",
    side: "asian",
    area: "Üsküdar → Şile",
    startsAt: "2026-11-22T05:30:00+00:00",
    endsAt: "2026-11-22T15:00:00+00:00",
    description: null,
    limitPeople: 20,
    limitBikes: null,
    minCc: 250,
    fullMembersOnly: true,
    places: [
      { name: "A", point: POINT, venueUrl: null, venueLabel: null },
      { name: "B", point: null, venueUrl: VENUE.url, venueLabel: VENUE.label },
      { name: "C", point: { lat: 41.2, lng: 29.6 }, venueUrl: null, venueLabel: null },
    ],
  });
  assert.equal(s.startsAt, "2026-11-22T08:30");
  assert.equal(s.endsAt, "2026-11-22T18:00");
  assert.equal(s.description, "");
  assert.equal(s.limitPeople, "20");
  assert.equal(s.limitBikes, "");
  assert.equal(s.minCc, "250");
  assert.equal(s.loop, false);
  assert.deepEqual(s.start, { ...emptyPlace("start"), name: "A", point: POINT });
  assert.deepEqual(s.stops, [{ ...emptyPlace("stop-0"), name: "B", venue: VENUE }]);
  assert.deepEqual(s.finish, { ...emptyPlace("finish"), name: "C", point: { lat: 41.2, lng: 29.6 } });
  // Round trip: the form sends what it read.
  const input = toEventInput(s);
  assert.equal(input.places.length, 3);
  assert.equal(eventInputSchema.safeParse(input).success, true);
});

test("eventToForm: a ride ending at its start is a loop; a meet-up keeps an empty finish", () => {
  const a = { name: "A", point: POINT, venueUrl: null, venueLabel: null };
  const base = {
    title: "T",
    side: null,
    area: null,
    startsAt: "2026-11-22T05:30:00Z",
    endsAt: null,
    description: "d",
    limitPeople: null,
    limitBikes: null,
    minCc: null,
    fullMembersOnly: false,
  };
  const loop = eventToForm({ ...base, kind: "ride", area: "Şile", places: [a, { ...a }] });
  assert.equal(loop.loop, true);
  assert.equal(loop.area, "Şile");
  const meetup = eventToForm({ ...base, kind: "meetup", places: [a] });
  assert.equal(meetup.kind, "meetup");
  assert.equal(meetup.area, "");
  assert.equal(meetup.loop, false);
  assert.deepEqual(meetup.finish, emptyPlace("finish"));
  assert.deepEqual(toEventInput(meetup).places, [a]);
});

test("errorAt: a field's own code; a place's box also shows its slot issues, never the name's", () => {
  const map = {
    title: "required",
    "places.1.name": "required",
    "places.2.venueUrl": "invalidVenue",
    "places.3": "placeRequired",
    "places.3.point.lat": "invalidNumber",
  };
  assert.equal(errorAt(map, "title"), "required");
  assert.equal(errorAt(map, "area"), undefined);
  assert.equal(errorAt(map, "places.1.name"), "required");
  assert.equal(errorAt(map, "places.1"), undefined);
  assert.equal(errorAt(map, "places.2"), "invalidVenue");
  assert.equal(errorAt(map, "places.3"), "placeRequired");
  assert.equal(errorAt({ "places.12.point.lat": "invalidNumber" }, "places.1"), undefined);
});

test("errorMessageKey: field-specific texts; a place's slot issue never gets a number-range text", () => {
  assert.equal(errorMessageKey("title", "required"), "required");
  assert.equal(errorMessageKey("startsAt", "required"), "requiredDate");
  assert.equal(errorMessageKey("limitPeople", "invalidNumber"), "limitRange");
  assert.equal(errorMessageKey("limitBikes", "invalidNumber"), "limitRange");
  assert.equal(errorMessageKey("minCc", "invalidNumber"), "ccRange");
  assert.equal(errorMessageKey("endsAt", "endsBeforeStart"), "endsBeforeStart");
  assert.equal(errorMessageKey("area", "noAreaForMeetup"), "other");
  assert.equal(errorMessageKey("places.1.name", "required"), "required");
  assert.equal(errorMessageKey("places.1.name", "tooLong"), "tooLong");
  assert.equal(errorMessageKey("places.1", "placeRequired"), "placeRequired");
  // `errorAt` hands the box a slot's code (`places.1.point.lat` → invalidNumber, `places.1.venueUrl` → invalidVenue).
  assert.equal(errorMessageKey("places.1", "invalidNumber"), "placeInvalid");
  assert.equal(errorMessageKey("places.1", "invalidVenue"), "placeInvalid");
  assert.equal(errorMessageKey("places.1", "tooLong"), "placeInvalid");
  assert.equal(errorMessageKey("places", "placeCount"), "other");
});

test("issueMap keys the first code per dotted path", () => {
  assert.deepEqual(
    issueMap([
      { path: ["title"], message: "required" },
      { path: ["title"], message: "tooLong" },
      { path: ["places", 2, "name"], message: "required" },
      { path: ["places", 1], message: "placeRequired" },
      { path: [], message: "x" },
    ]),
    { title: "required", "places.2.name": "required", "places.1": "placeRequired", "": "x" },
  );
});
