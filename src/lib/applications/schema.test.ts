import assert from "node:assert/strict";
import test from "node:test";
import { formDataToObject, validateApplication } from "./schema.ts";

const baseline: Record<string, string | string[]> = {
  locale: "tr",
  full_name: "Ayşe Yılmaz",
  phone: "0546 123 45 67",
  email: "ayse@example.com",
  birth_date: "1990-05-17",
  city_choice: "istanbul",
  district: "Kadıköy",
  languages: ["tr"],
  license_class: "a2",
  riding_years: "3",
  owns_motorcycle: "no",
  riding_styles: ["city"],
  group_experience: "some",
  in_other_clubs: "no",
  heard_from: "instagram_ad",
  event_interests: ["day_rides"],
  expectations: "Güzel bir topluluk bulmak.",
  alienating_behaviors: "Kibirli davranışlar beni uzaklaştırır.",
  conflict_handling: "Sakin konuşurum, dinlerim.",
  consent_privacy: "on",
  consent_rules: "on",
};

function formData(overrides: Record<string, string | string[]> = {}) {
  const fd = new FormData();
  for (const [key, value] of Object.entries({ ...baseline, ...overrides })) {
    for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  }
  return fd;
}

function validateField(field: string, value: string) {
  const result = validateApplication(formData({ [field]: value }));
  return result.ok ? undefined : result.fieldErrors[field];
}

test("a valid baseline application passes", () => {
  const result = validateApplication(formData());
  assert.equal(result.ok, true, JSON.stringify(result.ok ? null : result.fieldErrors));
});

test("writing questions need at least 15 characters", () => {
  for (const field of ["expectations", "alienating_behaviors", "conflict_handling"]) {
    assert.equal(validateField(field, "a".repeat(14)), "tooShort");
    assert.equal(validateField(field, "Sakin konuşurum!"), undefined); // 16 chars
  }
});

test("formDataToObject always returns the multi-select fields", () => {
  assert.deepEqual(formDataToObject(new FormData()).languages, []);
});

test("an issue without an error key reports invalidOption (never zod's English message)", () => {
  // `locale` has no custom error: zod's default message is not an Apply.errors key.
  assert.equal(validateField("locale", "de"), "invalidOption");
});

test("0 riding years requires the months", () => {
  assert.equal(validateField("riding_years", "0"), undefined);
  const result = validateApplication(formData({ riding_years: "0" }));
  assert.equal(result.ok ? undefined : result.fieldErrors.riding_months, "required");
  const ok = validateApplication(formData({ riding_years: "00", riding_months: "5" }));
  assert.equal(ok.ok && ok.data.riding_months, 5);
});

test("riding months must be 0-11", () => {
  for (const bad of ["12", "-1", "2.5"]) {
    const result = validateApplication(formData({ riding_years: "0", riding_months: bad }));
    assert.equal(result.ok ? undefined : result.fieldErrors.riding_months, "invalidNumber");
  }
  const zero = validateApplication(formData({ riding_years: "0", riding_months: "0" }));
  assert.equal(zero.ok && zero.data.riding_months, 0);
});

test("riding months are dropped when the years are 1 or more", () => {
  const result = validateApplication(formData({ riding_years: "3", riding_months: "5" }));
  assert.equal(result.ok && result.data.riding_months, null);
});
