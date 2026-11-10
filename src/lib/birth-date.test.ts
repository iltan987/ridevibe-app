// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAtLeast18, latestAdultBirthDate } from "./birth-date.ts";

test("latestAdultBirthDate is today minus 18 years", () => {
  assert.equal(latestAdultBirthDate("2026-11-11"), "2008-11-11");
  assert.equal(latestAdultBirthDate("2026-01-05"), "2008-01-05");
});

test("isAtLeast18: turning 18 today counts, one day short does not", () => {
  assert.equal(isAtLeast18("2008-11-11", "2026-11-11"), true);
  assert.equal(isAtLeast18("2008-11-12", "2026-11-11"), false);
  assert.equal(isAtLeast18("1990-05-17", "2026-11-11"), true);
});
