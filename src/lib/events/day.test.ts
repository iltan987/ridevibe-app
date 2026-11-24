import assert from "node:assert/strict";
import { test } from "node:test";
import { dayToDate } from "./day.ts";

const istanbul = (date: Date) =>
  new Intl.DateTimeFormat("tr", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" }).format(date);

test("a day stays the same day in Istanbul", () => {
  assert.equal(istanbul(dayToDate("2026-12-01")), "1 Aralık");
  assert.equal(istanbul(dayToDate("2026-01-01")), "1 Ocak");
  assert.equal(istanbul(dayToDate("2026-12-31")), "31 Aralık");
});

test("a day sits at 12:00 UTC", () => {
  assert.equal(dayToDate("2026-12-01").toISOString(), "2026-12-01T12:00:00.000Z");
});

test("a malformed or impossible day throws", () => {
  assert.throws(() => dayToDate("2026-13-01"));
  assert.throws(() => dayToDate("2026-02-30"));
  assert.throws(() => dayToDate("1 Aralık"));
  assert.throws(() => dayToDate("2026-12-01T10:00"));
});
