import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DRAFT_FIELDS,
  DRAFT_KEY,
  DRAFT_MAX_AGE_MS,
  browserStorage,
  buildDraft,
  clearDraft,
  parseDraft,
  readDraft,
  writeDraft,
  type DraftStorage,
} from "./draft.ts";
import { ARRAY_FIELDS } from "./schema.ts";
import { APPLY_STEPS } from "./steps.ts";

const NOW = new Date("2026-11-11T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

const NEVER_STORED = [
  "full_name", "phone", "email", "birth_date", "city_choice", "city", "district", "instagram",
  "languages", "other_languages", "consent_privacy", "consent_rules", "consent_photos",
];

function fakeStorage(initial?: string): DraftStorage & { value: string | null } {
  const s = {
    value: initial ?? null,
    getItem(key: string) {
      return key === DRAFT_KEY ? s.value : null;
    },
    setItem(key: string, v: string) {
      if (key === DRAFT_KEY) s.value = v;
    },
    removeItem(key: string) {
      if (key === DRAFT_KEY) s.value = null;
    },
  };
  return s;
}

function fullForm(): FormData {
  const fd = new FormData();
  for (const step of APPLY_STEPS) {
    for (const field of step.fields) {
      if (ARRAY_FIELDS.has(field)) {
        fd.append(field, "a");
        fd.append(field, "b");
      } else fd.set(field, "x");
    }
  }
  fd.set("locale", "tr");
  fd.set("utm_source", "ig");
  fd.set("utm_medium", "bio");
  return fd;
}

test("buildDraft keeps steps 1-3 and never contact fields or consents", () => {
  const draft = buildDraft(fullForm(), 2, NOW);
  assert.ok(draft);
  assert.deepEqual(new Set(Object.keys(draft.fields)), DRAFT_FIELDS);
  for (const f of NEVER_STORED) assert.ok(!(f in draft.fields), f);
  assert.deepEqual(draft.fields.riding_styles, ["a", "b"]);
  assert.equal(draft.step, 2);
  assert.equal(draft.v, 1);
  assert.equal(draft.savedAt, NOW.toISOString());
  assert.deepEqual(draft.utm, { utm_source: "ig", utm_medium: "bio" });
});

test("buildDraft drops empty values and keeps typing untrimmed", () => {
  const fd = new FormData();
  fd.set("expectations", "  hi ");
  fd.set("license_class", "");
  const draft = buildDraft(fd, 3, NOW);
  assert.deepEqual(draft?.fields, { expectations: "  hi " });
});

test("buildDraft returns null without any step 1-3 answer", () => {
  const fd = new FormData();
  fd.set("locale", "tr");
  fd.set("utm_source", "ig");
  fd.set("full_name", "Ali");
  assert.equal(buildDraft(fd, 1, NOW), null);
});

test("parseDraft round-trips a fresh draft", () => {
  const draft = buildDraft(fullForm(), 3, NOW);
  assert.deepEqual(parseDraft(JSON.stringify(draft), NOW), draft);
});

test("parseDraft rejects expired, future, other-version and malformed drafts", () => {
  const base = { v: 1, savedAt: NOW.toISOString(), step: 1, fields: { expectations: "x" }, utm: {} };
  const parse = (o: object) => parseDraft(JSON.stringify(o), NOW);
  assert.ok(parse(base));
  assert.equal(parse({ ...base, savedAt: new Date(NOW.getTime() - 8 * DAY).toISOString() }), null);
  assert.equal(parse({ ...base, savedAt: new Date(NOW.getTime() + 2 * DAY).toISOString() }), null);
  assert.equal(parse({ ...base, savedAt: "nope" }), null);
  assert.equal(parse({ ...base, v: 2 }), null);
  assert.equal(parse({ ...base, fields: [] }), null);
  assert.equal(parseDraft("{", NOW), null);
  assert.equal(parseDraft(null, NOW), null);
  assert.equal(parseDraft("null", NOW), null);
  assert.ok(DRAFT_MAX_AGE_MS === 7 * DAY);
});

test("parseDraft drops unknown fields and clamps the step", () => {
  const raw = JSON.stringify({
    v: 1,
    savedAt: NOW.toISOString(),
    step: 9,
    fields: { email: "a@b.c", expectations: "x", riding_styles: ["a", 3], license_class: 5 },
    utm: { utm_source: "ig", other: "z", utm_term: 1 },
  });
  const draft = parseDraft(raw, NOW);
  assert.ok(draft);
  assert.equal(draft.step, 4);
  assert.ok(!("email" in draft.fields));
  assert.ok(!("license_class" in draft.fields));
  assert.equal(draft.fields.expectations, "x");
  assert.deepEqual(draft.fields.riding_styles, ["a"]);
  assert.deepEqual(draft.utm, { utm_source: "ig" });
  assert.equal(parseDraft(JSON.stringify({ v: 1, savedAt: NOW.toISOString(), step: 0, fields: { expectations: "x" }, utm: {} }), NOW)?.step, 1);
});

test("readDraft removes an invalid stored draft", () => {
  const s = fakeStorage("{");
  assert.equal(readDraft(s, NOW), null);
  assert.equal(s.value, null);
  assert.equal(readDraft(null, NOW), null);
});

test("writeDraft(null) removes the key, clearDraft too", () => {
  const draft = buildDraft(fullForm(), 1, NOW);
  const s = fakeStorage();
  writeDraft(s, draft);
  assert.deepEqual(readDraft(s, NOW), draft);
  writeDraft(s, null);
  assert.equal(s.value, null);
  writeDraft(s, draft);
  clearDraft(s);
  assert.equal(s.value, null);
});

test("storage that throws doesn't break read/write", () => {
  const boom = () => {
    throw new Error("denied");
  };
  const s: DraftStorage = { getItem: boom, setItem: boom, removeItem: boom };
  assert.equal(readDraft(s, NOW), null);
  assert.doesNotThrow(() => writeDraft(s, buildDraft(fullForm(), 1, NOW)));
  assert.doesNotThrow(() => writeDraft(s, null));
  assert.doesNotThrow(() => clearDraft(s));
});

test("browserStorage is null without a window", () => {
  assert.equal(browserStorage(), null);
});
