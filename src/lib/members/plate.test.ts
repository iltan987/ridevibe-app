// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizePlate } from "./plate.ts";

test("normalizePlate formats Turkish plates", () => {
  assert.equal(normalizePlate("34abc123", false), "34 ABC 123");
  assert.equal(normalizePlate(" 34 abc 123 ", false), "34 ABC 123");
  assert.equal(normalizePlate("34-ABC-123", false), "34 ABC 123");
  assert.equal(normalizePlate("06a1234", false), "06 A 1234");
});

test("normalizePlate returns null for empty input", () => {
  assert.equal(normalizePlate("", false), null);
  assert.equal(normalizePlate("   ", true), null);
});

test("normalizePlate rejects invalid Turkish plates", () => {
  for (const raw of ["00ABC12", "82ABC12", "34ÇAB12", "34ABCD12", "34ABC1", "34ABC12345", "ABC123"]) {
    assert.equal(normalizePlate(raw, false), "invalid", raw);
  }
});

test("normalizePlate handles foreign plates", () => {
  assert.equal(normalizePlate("ab 123  cd", true), "AB 123 CD");
  assert.equal(normalizePlate("a", true), "invalid");
  assert.equal(normalizePlate("-AB", true), "invalid");
  assert.equal(normalizePlate("A".repeat(16), true), "invalid");
});
