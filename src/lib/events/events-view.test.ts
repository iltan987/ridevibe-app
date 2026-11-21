// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { eventsView } from "./events-view.ts";

type E = { id: string; side: "asian" | "european" | null; kind: "meetup" | "ride" };

const events: E[] = [
  { id: "a-ride", side: "asian", kind: "ride" },
  { id: "a-meet", side: "asian", kind: "meetup" },
  { id: "e-ride", side: "european", kind: "ride" },
  { id: "none-ride", side: null, kind: "ride" },
  ...Array.from({ length: 26 }, (_, i): E => ({ id: `e-meet-${i + 1}`, side: "european", kind: "meetup" })),
];
const ids = (items: E[]) => items.map((e) => e.id);
const none = new Set<string>();

test("no filter: every event, counts per side and kind, first page of 25", () => {
  const view = eventsView(events, { side: null, kind: null, mine: false, page: 1 }, none);
  assert.deepEqual(view.counts, { all: 30, asian: 3, european: 28, meetup: 27, ride: 3, mine: 0 });
  assert.equal(view.total, 30);
  assert.equal(view.items.length, 25);
  assert.deepEqual([view.page, view.pageCount, view.from, view.to], [1, 2, 1, 25]);
});

test("side counts honour the kind filter, kind counts honour the side filter; 'all' counts everything", () => {
  const view = eventsView(events, { side: "asian", kind: "ride", mine: false, page: 1 }, none);
  assert.deepEqual(view.counts, { all: 30, asian: 2, european: 2, meetup: 1, ride: 2, mine: 0 });
  assert.deepEqual(ids(view.items), ["a-ride", "none-ride"]);
});

test("an event without a side shows under both side filters; order is kept", () => {
  const view = eventsView(events, { side: null, kind: "ride", mine: false, page: 1 }, none);
  assert.deepEqual(ids(view.items), ["a-ride", "e-ride", "none-ride"]);
  assert.deepEqual(ids(eventsView(events, { side: "european", kind: "ride", mine: false, page: 1 }, none).items), [
    "e-ride",
    "none-ride",
  ]);
  assert.deepEqual(ids(eventsView(events, { side: "asian", kind: "ride", mine: false, page: 1 }, none).items), [
    "a-ride",
    "none-ride",
  ]);
});

test("page 2 holds the rest; an out-of-range page is clamped to the last one", () => {
  assert.deepEqual(ids(eventsView(events, { side: null, kind: null, mine: false, page: 2 }, none).items), [
    "e-meet-22",
    "e-meet-23",
    "e-meet-24",
    "e-meet-25",
    "e-meet-26",
  ]);
  const clamped = eventsView(events, { side: null, kind: null, mine: false, page: 99 }, none);
  assert.equal(clamped.page, 2);
  assert.deepEqual([clamped.from, clamped.to, clamped.total], [26, 30, 30]);
});

test("nothing matches: an empty page 1 with from 0", () => {
  const view = eventsView([], { side: "asian", kind: "meetup", mine: false, page: 3 }, none);
  assert.deepEqual([view.items.length, view.page, view.from, view.total], [0, 1, 0, 0]);
});

test("mine keeps the joined events in list order; its count honours the side and kind filters", () => {
  const joined = new Set(["none-ride", "a-ride", "e-meet-3", "gone"]);
  const view = eventsView(events, { side: null, kind: null, mine: true, page: 1 }, joined);
  assert.deepEqual(ids(view.items), ["a-ride", "none-ride", "e-meet-3"]);
  assert.equal(view.total, 3);
  assert.equal(view.counts.mine, 3);
  // Side and kind chips count what tapping them would list: within the joined events.
  assert.deepEqual(view.counts, { all: 30, asian: 2, european: 2, meetup: 1, ride: 2, mine: 3 });

  const asianRides = eventsView(events, { side: "asian", kind: "ride", mine: false, page: 1 }, joined);
  assert.equal(asianRides.counts.mine, 2);
  assert.deepEqual(ids(eventsView(events, { side: "european", kind: null, mine: true, page: 1 }, joined).items), [
    "none-ride",
    "e-meet-3",
  ]);
});

test("mine with nothing joined: an empty page, the other filters' counts drop to zero", () => {
  const view = eventsView(events, { side: null, kind: null, mine: true, page: 1 }, none);
  assert.deepEqual([view.items.length, view.total, view.counts.mine, view.counts.all], [0, 0, 0, 30]);
  assert.deepEqual([view.counts.asian, view.counts.ride], [0, 0]);
});
