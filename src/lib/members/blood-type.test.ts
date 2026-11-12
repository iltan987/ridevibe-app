// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { BLOOD_TYPES, bloodTypeLabel, parseBloodTypeParam } from "./blood-type.ts";

test("bloodTypeLabel shows Rh with a real minus sign", () => {
  assert.equal(bloodTypeLabel("A+"), "A Rh+");
  assert.equal(bloodTypeLabel("A-"), "A Rh−");
  assert.equal(bloodTypeLabel("AB+"), "AB Rh+");
  assert.equal(bloodTypeLabel("0-"), "0 Rh−");
  assert.equal(BLOOD_TYPES.length, 8);
});

test("parseBloodTypeParam accepts exact enum values only", () => {
  assert.equal(parseBloodTypeParam("0+"), "0+");
  assert.equal(parseBloodTypeParam("0 "), null);
  assert.equal(parseBloodTypeParam(["A+"]), null);
  assert.equal(parseBloodTypeParam(undefined), null);
});
