// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { istanbulToday, latestAdultBirthDate } from "../birth-date.ts";
import {
  birthDateSchema,
  bloodTypeSchema,
  emergencyContactSchema,
  locationSchema,
  motorcycleSchema,
  normalizeInstagram,
  visibilitySchema,
} from "./schema.ts";

test("birthDateSchema accepts an adult ISO date with the birthday switch", () => {
  assert.deepEqual(birthDateSchema.safeParse({ birth_date: "1990-05-17", show_birthday: false }).data, {
    birth_date: "1990-05-17",
    show_birthday: false,
  });
  const limit = latestAdultBirthDate(istanbulToday());
  assert.equal(birthDateSchema.safeParse({ birth_date: limit, show_birthday: true }).success, true);
});

test("birthDateSchema requires the birthday switch value", () => {
  assert.equal(birthDateSchema.safeParse({ birth_date: "1990-05-17" }).success, false);
  assert.equal(birthDateSchema.safeParse({ birth_date: "1990-05-17", show_birthday: "yes" }).success, false);
});

test("birthDateSchema maps errors to profile keys", () => {
  const key = (birth_date: unknown) => birthDateSchema.safeParse({ birth_date, show_birthday: true }).error?.issues[0]?.message;
  assert.equal(key(""), "required");
  assert.equal(key(undefined), "required");
  assert.equal(key("17.05.1990"), "invalidDate");
  assert.equal(key("1990-02-30"), "invalidDate");
  assert.equal(key("1920-01-01"), "invalidDate");
  assert.equal(key("2099-01-01"), "tooYoung");
});

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
  assert.deepEqual(ok.data, { brand: "Yamaha", model: "MT-07", cc: undefined, plate: null, plate_foreign: false });
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
  const ok = visibilitySchema.safeParse({ instagram: "@rider.one", show_instagram: true, show_birthday: false, show_plates: true });
  assert.deepEqual(ok.data, { instagram: "rider.one", show_instagram: true, show_birthday: false, show_plates: true });
  assert.equal(visibilitySchema.safeParse({ instagram: "", show_instagram: false, show_birthday: false, show_plates: true }).data?.instagram, null);
  const bad = visibilitySchema.safeParse({ instagram: "rider one", show_instagram: true, show_birthday: false, show_plates: true });
  assert.equal(bad.success, false);
  assert.equal(bad.error?.issues[0].message, "invalidInstagram");
  assert.deepEqual(bad.error?.issues[0].path, ["instagram"]);
});

test("emergencyContactSchema normalises the phone and validates the relationship", () => {
  const base = { name: " Ayşe Yılmaz ", relationship: "parent" };
  assert.deepEqual(emergencyContactSchema.safeParse({ ...base, phone: "0532 123 45 67" }).data, {
    name: "Ayşe Yılmaz",
    relationship: "parent",
    phone: "+905321234567",
  });
  assert.equal(
    emergencyContactSchema.safeParse({ ...base, phone: "+90 216 123 45 67" }).error?.issues[0]?.message,
    "notTurkishMobile",
  );
  assert.equal(emergencyContactSchema.safeParse({ ...base, relationship: "boss", phone: "0532 123 45 67" }).success, false);
});

test("bloodTypeSchema requires the consent", () => {
  assert.equal(bloodTypeSchema.safeParse({ blood_type: "A+", consent: true }).success, true);
  assert.equal(bloodTypeSchema.safeParse({ blood_type: "A+", consent: false }).error?.issues[0]?.message, "consentRequired");
  assert.equal(bloodTypeSchema.safeParse({ blood_type: "A+" }).error?.issues[0]?.message, "consentRequired");
  assert.equal(bloodTypeSchema.safeParse({ blood_type: "C+", consent: true }).success, false);
});

test("motorcycleSchema normalises the plate", () => {
  const bike = { brand: "Yamaha", model: "MT-07", cc: "" };
  assert.equal(motorcycleSchema.safeParse({ ...bike, plate: "34abc123", plate_foreign: false }).data?.plate, "34 ABC 123");
  assert.equal(motorcycleSchema.safeParse({ ...bike, plate: "", plate_foreign: false }).data?.plate, null);
  assert.equal(motorcycleSchema.safeParse(bike).data?.plate, null);
  assert.equal(motorcycleSchema.safeParse(bike).data?.plate_foreign, false);
  assert.equal(motorcycleSchema.safeParse({ ...bike, plate: "ab 12", plate_foreign: true }).data?.plate, "AB 12");
  assert.equal(
    motorcycleSchema.safeParse({ ...bike, plate: "82ABC12", plate_foreign: false }).error?.issues[0]?.message,
    "invalidPlate",
  );
});

test("visibilitySchema carries show_plates", () => {
  const v = { instagram: "", show_instagram: false, show_birthday: true };
  assert.equal(visibilitySchema.safeParse({ ...v, show_plates: true }).data?.show_plates, true);
  assert.equal(visibilitySchema.safeParse(v).success, false);
});
