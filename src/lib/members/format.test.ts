// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatMotorcycle, instagramUrl, locationLabel } from "./format.ts";

test("formatMotorcycle shows cc only when known", () => {
  assert.equal(formatMotorcycle({ brand: "Yamaha", model: "MT-07", cc: 689 }), "Yamaha MT-07 · 689 cc");
  assert.equal(formatMotorcycle({ brand: "Yamaha", model: "MT-07", cc: null }), "Yamaha MT-07");
});

test("instagramUrl links to the profile", () => {
  assert.equal(instagramUrl("ride.vibe"), "https://instagram.com/ride.vibe");
});

test("locationLabel joins the parts that exist", () => {
  assert.equal(locationLabel("Kadıköy", "Anadolu Yakası"), "Kadıköy · Anadolu Yakası");
  assert.equal(locationLabel("Kadıköy", null), "Kadıköy");
  assert.equal(locationLabel(null, "Avrupa Yakası"), "Avrupa Yakası");
  assert.equal(locationLabel(null, null), null);
  assert.equal(locationLabel("", ""), null);
});

test("formatMotorcycle appends the plate when present", () => {
  assert.equal(
    formatMotorcycle({ brand: "Yamaha", model: "MT-07", cc: 689, plate: "34 ABC 123" }),
    "Yamaha MT-07 · 689 cc · 34 ABC 123",
  );
  assert.equal(formatMotorcycle({ brand: "Yamaha", model: "MT-07", cc: null, plate: "34 ABC 123" }), "Yamaha MT-07 · 34 ABC 123");
  assert.equal(formatMotorcycle({ brand: "Yamaha", model: "MT-07", cc: 689, plate: null }), "Yamaha MT-07 · 689 cc");
});
