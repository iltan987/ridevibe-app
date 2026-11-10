// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { locationSchema, motorcycleSchema, normalizeInstagram, visibilitySchema } from "./schema.ts";

test("normalizeInstagram accepts handles and profile URLs", () => {
  for (const raw of [
    "@rider.one",
    "rider.one",
    " rider.one ",
    "https://instagram.com/rider.one",
    "https://www.instagram.com/rider.one/",
    "http://instagram.com/rider.one",
    "instagram.com/rider.one?igsh=abc",
  ]) {
    assert.equal(normalizeInstagram(raw), "rider.one", raw);
  }
});

test("normalizeInstagram: empty is null, junk is invalid", () => {
  assert.equal(normalizeInstagram(""), null);
  assert.equal(normalizeInstagram("  "), null);
  for (const raw of ["rider one", "a".repeat(31), "https://evil.example/rider", "@", "rider/extra"]) {
    assert.equal(normalizeInstagram(raw), "invalid", raw);
  }
});

test("motorcycleSchema trims, treats empty cc as unknown and bounds cc", () => {
  const ok = motorcycleSchema.safeParse({ brand: " Yamaha ", model: "MT-07", cc: "" });
  assert.ok(ok.success);
  assert.deepEqual(ok.data, { brand: "Yamaha", model: "MT-07", cc: undefined });
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B", cc: "689" }).data?.cc, 689);
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B", cc: 689 }).data?.cc, 689);
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B", cc: "40" }).success, false);
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B", cc: "3001" }).success, false);
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B", cc: "6.5" }).success, false);
  assert.equal(motorcycleSchema.safeParse({ brand: "  ", model: "B" }).success, false);
  assert.equal(motorcycleSchema.safeParse({ brand: "A", model: "B".repeat(61) }).success, false);
});

test("locationSchema validates Istanbul districts and derives the side", () => {
  const kadikoy = locationSchema.safeParse({ city_choice: "istanbul", district: "Kadıköy" });
  assert.deepEqual(kadikoy.data, { city: "İstanbul", district: "Kadıköy", side: "asian" });
  assert.equal(locationSchema.safeParse({ city_choice: "istanbul", district: "Atlantis" }).success, false);

  const ankara = locationSchema.safeParse({ city_choice: "other", city: "Ankara", district: "Çankaya" });
  assert.deepEqual(ankara.data, { city: "Ankara", district: "Çankaya", side: null });
  assert.equal(locationSchema.safeParse({ city_choice: "other", district: "Çankaya" }).success, false);
});

test("visibilitySchema normalizes instagram and reports an invalid handle", () => {
  const ok = visibilitySchema.safeParse({ instagram: "@rider.one", show_instagram: true, show_birthday: false });
  assert.deepEqual(ok.data, { instagram: "rider.one", show_instagram: true, show_birthday: false });
  assert.equal(visibilitySchema.safeParse({ instagram: "", show_instagram: false, show_birthday: false }).data?.instagram, null);
  const bad = visibilitySchema.safeParse({ instagram: "rider one", show_instagram: true, show_birthday: false });
  assert.equal(bad.success, false);
  assert.equal(bad.error?.issues[0].message, "invalidInstagram");
  assert.deepEqual(bad.error?.issues[0].path, ["instagram"]);
});
