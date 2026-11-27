import assert from "node:assert/strict";
import test from "node:test";
import { asksRidingMonths } from "./riding-experience.ts";

test("the months are asked only when the years answer is 0", () => {
  assert.equal(asksRidingMonths("0"), true);
  assert.equal(asksRidingMonths("00"), true);
  for (const other of [undefined, "", "1", "12", "abc"]) assert.equal(asksRidingMonths(other), false);
});
