// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { daysSince } from "./probation-days.ts";

test("same Istanbul day is 0, however many hours apart", () => {
  assert.equal(daysSince(new Date("2026-11-18T00:30:00+03:00"), new Date("2026-11-18T23:30:00+03:00")), 0);
});

test("crossing Istanbul midnight counts a day, even a few minutes apart", () => {
  assert.equal(daysSince(new Date("2026-11-18T23:50:00+03:00"), new Date("2026-11-19T00:10:00+03:00")), 1);
});

test("uses Istanbul days, not UTC days", () => {
  // 22:00 UTC on the 18th is already 01:00 on the 19th in Istanbul: still the same Istanbul day at 04:00.
  assert.equal(daysSince(new Date("2026-11-18T22:00:00Z"), new Date("2026-11-19T01:00:00Z")), 0);
});

test("several days apart; a future start clamps to 0", () => {
  assert.equal(daysSince(new Date("2026-11-10T12:00:00+03:00"), new Date("2026-11-18T09:00:00+03:00")), 8);
  assert.equal(daysSince(new Date("2026-11-20T12:00:00+03:00"), new Date("2026-11-18T09:00:00+03:00")), 0);
});
