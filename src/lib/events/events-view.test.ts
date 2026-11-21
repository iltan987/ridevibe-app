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

test("no filter: every event, counts per side and kind, first page of 25", () => {
  const view = eventsView(events, { side: null, kind: null, page: 1 });
  assert.deepEqual(view.counts, { all: 30, asian: 2, european: 27, meetup: 27, ride: 3 });
  assert.equal(view.total, 30);
  assert.equal(view.items.length, 25);
  assert.deepEqual([view.page, view.pageCount, view.from, view.to], [1, 2, 1, 25]);
});

test("side counts honour the kind filter, kind counts honour the side filter; 'all' counts everything", () => {
  const view = eventsView(events, { side: "asian", kind: "ride", page: 1 });
  assert.deepEqual(view.counts, { all: 30, asian: 1, european: 1, meetup: 1, ride: 1 });
  assert.deepEqual(ids(view.items), ["a-ride"]);
});

test("a side filter leaves out events without a side; order is kept", () => {
  const view = eventsView(events, { side: null, kind: "ride", page: 1 });
  assert.deepEqual(ids(view.items), ["a-ride", "e-ride", "none-ride"]);
  assert.ok(!ids(eventsView(events, { side: "european", kind: "ride", page: 1 }).items).includes("none-ride"));
});

test("page 2 holds the rest; an out-of-range page is clamped to the last one", () => {
  assert.deepEqual(ids(eventsView(events, { side: null, kind: null, page: 2 }).items), [
    "e-meet-22",
    "e-meet-23",
    "e-meet-24",
    "e-meet-25",
    "e-meet-26",
  ]);
  const clamped = eventsView(events, { side: null, kind: null, page: 99 });
  assert.equal(clamped.page, 2);
  assert.deepEqual([clamped.from, clamped.to, clamped.total], [26, 30, 30]);
});

test("nothing matches: an empty page 1 with from 0", () => {
  const view = eventsView([], { side: "asian", kind: "meetup", page: 3 });
  assert.deepEqual([view.items.length, view.page, view.from, view.total], [0, 1, 0, 0]);
});
