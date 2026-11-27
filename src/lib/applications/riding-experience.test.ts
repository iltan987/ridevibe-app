import assert from "node:assert/strict";
import test from "node:test";
import { asksRidingMonths, ridingExperience } from "./riding-experience.ts";

test("the months are asked only when the years answer is 0", () => {
  assert.equal(asksRidingMonths("0"), true);
  assert.equal(asksRidingMonths("00"), true);
  for (const other of [undefined, "", "1", "12", "abc"]) assert.equal(asksRidingMonths(other), false);
});

test("ridingExperience picks the staff label", () => {
  assert.deepEqual(ridingExperience(3, null), { key: "years", years: 3 });
  assert.deepEqual(ridingExperience(0, 5), { key: "months", months: 5 });
  assert.deepEqual(ridingExperience(0, 0), { key: "underMonth" });
  assert.deepEqual(ridingExperience(0, null), { key: "underYear" });
});
