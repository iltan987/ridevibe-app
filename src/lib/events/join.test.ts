// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkJoin, countsLine, joinResult, joinSchema, reasonFromHint, type Counts, type Signup } from "./join.ts";

const START = Date.parse("2026-12-05T08:00:00Z");
type JoinEvent = Parameters<typeof checkJoin>[0]["event"];
const event: JoinEvent = {
  status: "scheduled",
  startsAt: "2026-12-05T08:00:00Z",
  limitPeople: null,
  limitBikes: null,
  minCc: null,
  fullMembersOnly: false,
};
const counts = (c: Partial<Counts> = {}): Counts => ({
  people: 0,
  bikes: 0,
  members: 0,
  guests: 0,
  probation: 0,
  ...c,
});
const rider = (guests = 0): Signup => ({ role: "rider", guests });
const passenger = (guests = 0): Signup => ({ role: "passenger", guests });

type Over = Partial<Omit<Parameters<typeof checkJoin>[0], "event">> & { event?: Partial<JoinEvent> };
const check = (o: Over = {}) =>
  checkJoin({
    counts: counts(),
    mine: null,
    next: rider(),
    probation: false,
    maxCc: 600,
    now: START - 60_000,
    ...o,
    event: { ...event, ...o.event },
  });

test("joinSchema: role and 0-3 guests", () => {
  assert.deepEqual(joinSchema.parse({ role: "rider", guests: 3 }), { role: "rider", guests: 3 });
  assert.equal(joinSchema.safeParse({ role: "rider", guests: 4 }).success, false);
  assert.equal(joinSchema.safeParse({ role: "rider", guests: -1 }).success, false);
  assert.equal(joinSchema.safeParse({ role: "rider", guests: 1.5 }).success, false);
  assert.equal(joinSchema.safeParse({ role: "driver", guests: 0 }).success, false);
});

test("checkJoin: an open event passes", () => {
  assert.equal(check(), null);
});

test("checkJoin: cancelled, and started exactly at starts_at", () => {
  assert.equal(check({ event: { status: "cancelled" } }), "cancelled");
  assert.equal(check({ now: START }), "started");
  assert.equal(check({ now: START + 1 }), "started");
  assert.equal(check({ now: START - 1 }), null);
});

test("checkJoin: cancelled comes before started", () => {
  assert.equal(check({ event: { status: "cancelled" }, now: START }), "cancelled");
});

test("checkJoin: people limit boundary", () => {
  const limited = { limitPeople: 3 };
  assert.equal(check({ event: limited, counts: counts({ people: 2 }), next: passenger() }), null);
  assert.equal(check({ event: limited, counts: counts({ people: 3 }), next: passenger() }), "peopleLimit");
  assert.equal(check({ event: limited, counts: counts({ people: 2 }), next: passenger(1) }), "peopleLimit");
});

test("checkJoin: bike limit refuses a rider, not a passenger", () => {
  const limited = { limitBikes: 2 };
  assert.equal(check({ event: limited, counts: counts({ bikes: 1 }) }), null);
  assert.equal(check({ event: limited, counts: counts({ bikes: 2 }) }), "bikeLimit");
  assert.equal(check({ event: limited, counts: counts({ bikes: 2 }), next: passenger() }), null);
});

test("checkJoin: min cc for riders only; null cc does not count", () => {
  const e = { minCc: 400 };
  assert.equal(check({ event: e, maxCc: 250 }), "minCc");
  assert.equal(check({ event: e, maxCc: 400 }), null);
  assert.equal(check({ event: e, maxCc: null }), "minCc");
  assert.equal(check({ event: e, maxCc: null, next: passenger() }), null);
});

test("checkJoin: full members only refuses a new ön alım sign-up, not an existing one's edit", () => {
  const e = { fullMembersOnly: true };
  assert.equal(check({ event: e, probation: true }), "fullMembersOnly");
  assert.equal(check({ event: e, probation: false }), null);
  assert.equal(
    check({ event: e, probation: true, mine: passenger(), counts: counts({ people: 1 }), next: passenger(1) }),
    null,
  );
});

test("checkJoin: order is full members, min cc, people, bikes", () => {
  const all = { fullMembersOnly: true, minCc: 400, limitPeople: 1, limitBikes: 1 };
  const full = counts({ people: 1, bikes: 1 });
  assert.equal(check({ event: all, probation: true, maxCc: 100, counts: full }), "fullMembersOnly");
  assert.equal(check({ event: all, maxCc: 100, counts: full }), "minCc");
  assert.equal(check({ event: all, counts: full }), "peopleLimit");
  assert.equal(check({ event: { ...all, limitPeople: 5 }, counts: full }), "bikeLimit");
});

test("checkJoin: don't make it worse (limits tightened after joining)", () => {
  // 3 people with a limit of 2; I am one rider with 1 guest (2 people) and others hold 1.
  const over = { limitPeople: 2, limitBikes: 1, minCc: 900 };
  const c = counts({ people: 3, bikes: 2 });
  const mine = rider(1);
  assert.equal(check({ event: over, counts: c, mine, next: rider(0), maxCc: 100 }), null, "lower guests");
  assert.equal(check({ event: over, counts: c, mine, next: passenger(1), maxCc: 100 }), null, "switch to passenger");
  assert.equal(check({ event: over, counts: c, mine, next: rider(1), maxCc: 100 }), null, "no change");
  assert.equal(check({ event: over, counts: c, mine, next: rider(2), maxCc: 100 }), "peopleLimit", "more guests");
});

test("checkJoin: switching passenger to rider with full bikes refuses; more guests refuses on people", () => {
  assert.equal(
    check({ event: { limitBikes: 1 }, counts: counts({ people: 2, bikes: 1 }), mine: passenger(), next: rider() }),
    "bikeLimit",
  );
  assert.equal(
    check({ event: { limitPeople: 3 }, counts: counts({ people: 3 }), mine: rider(1), next: rider(2) }),
    "peopleLimit",
  );
  // own footprint is subtracted: 3 people with mine=2 leaves room for 1 more guest
  assert.equal(
    check({ event: { limitPeople: 3 }, counts: counts({ people: 3 }), mine: rider(1), next: rider(1) }),
    null,
  );
  assert.equal(
    check({ event: { limitPeople: 3 }, counts: counts({ people: 2, bikes: 1 }), mine: rider(1), next: rider(2) }),
    null,
  );
});

test("checkJoin: min cc applies when switching to rider, not when already a rider", () => {
  assert.equal(check({ event: { minCc: 400 }, mine: passenger(), next: rider(), maxCc: 250 }), "minCc");
  assert.equal(check({ event: { minCc: 400 }, mine: rider(), next: rider(1), maxCc: 250 }), null);
});

test("reasonFromHint maps every DB hint", () => {
  assert.equal(reasonFromHint("started"), "started");
  assert.equal(reasonFromHint("cancelled"), "cancelled");
  assert.equal(reasonFromHint("people_limit"), "peopleLimit");
  assert.equal(reasonFromHint("bike_limit"), "bikeLimit");
  assert.equal(reasonFromHint("min_cc"), "minCc");
  assert.equal(reasonFromHint("full_members_only"), "fullMembersOnly");
  assert.equal(reasonFromHint("has_signups"), "hasSignups");
  assert.equal(reasonFromHint("nonsense"), null);
  assert.equal(reasonFromHint(undefined), null);
});

test("joinResult maps the RPC error", () => {
  assert.deepEqual(joinResult(null), { status: "ok" });
  assert.deepEqual(joinResult({ code: "P0001", hint: "people_limit" }), { status: "refused", reason: "peopleLimit" });
  assert.deepEqual(joinResult({ code: "P0001", hint: "started" }), { status: "refused", reason: "started" });
  assert.deepEqual(joinResult({ code: "P0001", hint: "has_signups" }), { status: "error" });
  assert.deepEqual(joinResult({ code: "P0001" }), { status: "error" });
  assert.deepEqual(joinResult({ code: "42501" }), { status: "forbidden" });
  assert.deepEqual(joinResult({ code: "P0002" }), { status: "notFound" });
  assert.deepEqual(joinResult({ code: "22023" }), { status: "invalid" });
  assert.deepEqual(joinResult({ code: "22P02" }), { status: "invalid" });
  assert.deepEqual(joinResult({ code: "XX000" }), { status: "error" });
  assert.deepEqual(joinResult({}), { status: "error" });
});

test("countsLine: numbers, with limits, over a limit", () => {
  assert.deepEqual(countsLine(counts({ people: 18, bikes: 11 }), { people: null, bikes: null }), {
    people: "18",
    bikes: "11",
    over: false,
  });
  assert.deepEqual(countsLine(counts({ people: 18, bikes: 11 }), { people: 20, bikes: 12 }), {
    people: "18 / 20",
    bikes: "11 / 12",
    over: false,
  });
  assert.equal(countsLine(counts({ people: 20, bikes: 12 }), { people: 20, bikes: 12 }).over, false);
  assert.equal(countsLine(counts({ people: 21, bikes: 5 }), { people: 20, bikes: 12 }).over, true);
  assert.equal(countsLine(counts({ people: 5, bikes: 13 }), { people: 20, bikes: 12 }).over, true);
  assert.equal(countsLine(counts({ people: 25, bikes: 5 }), { people: null, bikes: 12 }).over, false);
});
