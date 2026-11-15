import assert from "node:assert/strict";
import test from "node:test";
import { APPLICATION_FIELDS } from "./schema.ts";
import { APPLY_STEPS, errorsOfStep, firstStepWithError, parseStep } from "./steps.ts";

test("every schema field except locale and UTM belongs to exactly one step", () => {
  const stepFields = APPLY_STEPS.flatMap((s) => s.fields);
  assert.equal(new Set(stepFields).size, stepFields.length);
  const expected = APPLICATION_FIELDS.filter((f) => f !== "locale" && !f.startsWith("utm_"));
  assert.deepEqual([...stepFields].sort(), [...expected].sort());
});
test("steps are riding, club, words, you", () =>
  assert.deepEqual(
    APPLY_STEPS.map((s) => s.id),
    ["riding", "club", "words", "you"],
  ));
test("parseStep accepts 1-4 only", () => {
  assert.equal(parseStep("3"), 3);
  for (const v of [null, undefined, "", "0", "5", "2.5", "abc", " 2"]) assert.equal(parseStep(v), null);
});
test("firstStepWithError picks the earliest step", () => {
  assert.equal(firstStepWithError({ email: "required", expectations: "tooShort" }), 3);
  assert.equal(firstStepWithError({ license_class: "required", consent_rules: "mustAccept" }), 1);
  assert.equal(firstStepWithError({}), null);
  assert.equal(firstStepWithError({ locale: "invalidOption" }), 1);
});
test("errorsOfStep keeps only that step's fields", () =>
  assert.deepEqual(errorsOfStep({ email: "required", riding_years: "invalidNumber" }, 1), {
    riding_years: "invalidNumber",
  }));
