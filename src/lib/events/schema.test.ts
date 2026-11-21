// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventInputSchema, toRpcArgs } from "./schema.ts";

const POINT = { lat: 41.0255, lng: 29.0154 };
const place = (name: string) => ({ name, point: POINT, venueUrl: null, venueLabel: null });
const VENUE = "https://www.google.com/maps/place/Starbucks,+Moda";

const meetup = {
  kind: "meetup",
  title: " Sahilde kahve ",
  side: null,
  area: null,
  startsAt: "2026-11-22T08:30",
  endsAt: null,
  description: null,
  limitPeople: null,
  limitBikes: null,
  minCc: null,
  fullMembersOnly: false,
  places: [place("Moda")],
};
const ride = {
  ...meetup,
  kind: "ride",
  side: "european",
  area: "Ağva",
  endsAt: "2026-11-22T18:00",
  description: "Rota",
  limitPeople: 20,
  limitBikes: 15,
  minCc: 250,
  places: [place("Başlangıç"), place("Bitiş")],
};

const ok = (v: unknown) => eventInputSchema.safeParse(v).success;

test("accepts a valid meet-up and ride, trimming text", () => {
  assert.equal(ok(meetup), true);
  assert.equal(eventInputSchema.parse(meetup).title, "Sahilde kahve");
  assert.equal(ok(ride), true);
});

test("ride and meet-up place and area rules", () => {
  assert.equal(ok({ ...ride, places: [place("A")] }), false);
  assert.equal(ok({ ...ride, places: Array.from({ length: 13 }, (_, i) => place(`P${i}`)) }), false);
  assert.equal(ok({ ...ride, places: Array.from({ length: 12 }, (_, i) => place(`P${i}`)) }), true);
  assert.equal(ok({ ...ride, area: null }), false);
  assert.equal(ok({ ...meetup, area: "Ağva" }), false);
  assert.equal(ok({ ...meetup, places: [place("A"), place("B")] }), false);
});

test("limits", () => {
  assert.equal(ok({ ...meetup, title: "a".repeat(80) }), true);
  assert.equal(ok({ ...meetup, title: "a".repeat(81) }), false);
  assert.equal(ok({ ...meetup, title: "  " }), false);
  assert.equal(ok({ ...ride, limitPeople: 0 }), false);
  assert.equal(ok({ ...ride, limitBikes: 501 }), false);
  assert.equal(ok({ ...ride, minCc: 40 }), false);
  assert.equal(ok({ ...ride, minCc: 3001 }), false);
  assert.equal(ok({ ...ride, description: "a".repeat(2001) }), false);
  assert.equal(eventInputSchema.parse({ ...ride, description: "  " }).description, null);
});

test("times", () => {
  assert.equal(ok({ ...ride, endsAt: "2026-11-22T08:30" }), false);
  assert.equal(ok({ ...ride, endsAt: "2026-11-22T07:00" }), false);
  assert.equal(ok({ ...ride, startsAt: "2026-02-30T08:30" }), false);
  assert.equal(ok({ ...ride, startsAt: "" }), false);
});

test("places: point and venue rules", () => {
  const bad = (p: object) => ok({ ...meetup, places: [{ ...place("A"), ...p }] });
  assert.equal(bad({ point: { lat: 95, lng: 29 } }), false);
  assert.equal(bad({ point: { lat: 41, lng: 181 } }), false);
  assert.equal(bad({ point: null }), false);
  assert.equal(bad({ point: null, venueUrl: VENUE }), true);
  assert.equal(bad({ point: null, venueUrl: VENUE, venueLabel: "Starbucks, Moda" }), true);
  assert.equal(bad({ venueLabel: "x" }), false);
  assert.equal(bad({ venueUrl: "https://example.com/maps/place/x" }), false);
  assert.equal(bad({ venueUrl: `${VENUE}?hl=tr` }), false);
  assert.equal(bad({ venueUrl: `${VENUE}#x` }), false);
  assert.equal(bad({ venueUrl: `${VENUE} x` }), false);
  assert.equal(bad({ venueUrl: "https://yandex.com.tr/maps/org/starbucks/123/" }), true);
  assert.equal(bad({ venueUrl: `${VENUE}${"a".repeat(500)}` }), false);
  assert.equal(bad({ point: null, venueUrl: VENUE, venueLabel: "a".repeat(201) }), false);
  assert.equal(bad({ name: "a".repeat(81) }), false);
  assert.equal(bad({ name: "" }), false);
});

test("toRpcArgs converts times to UTC and maps place keys", () => {
  const { p_event, p_places } = toRpcArgs(eventInputSchema.parse(ride));
  assert.deepEqual(p_event, {
    kind: "ride",
    title: "Sahilde kahve",
    side: "european",
    area: "Ağva",
    starts_at: "2026-11-22T05:30:00.000Z",
    ends_at: "2026-11-22T15:00:00.000Z",
    description: "Rota",
    limit_people: 20,
    limit_bikes: 15,
    min_cc: 250,
    full_members_only: false,
  });
  assert.deepEqual(p_places, [
    { name: "Başlangıç", lat: 41.0255, lng: 29.0154, venue_url: null, venue_label: null },
    { name: "Bitiş", lat: 41.0255, lng: 29.0154, venue_url: null, venue_label: null },
  ]);
  const venue = toRpcArgs(
    eventInputSchema.parse({ ...meetup, places: [{ name: "S", point: null, venueUrl: VENUE, venueLabel: "L" }] }),
  );
  assert.deepEqual(venue.p_places, [{ name: "S", lat: null, lng: null, venue_url: VENUE, venue_label: "L" }]);
});
