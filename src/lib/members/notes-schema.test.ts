// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { noteBodySchema } from "./notes-schema.ts";

test("noteBodySchema trims the text and keeps Turkish characters", () => {
  assert.equal(noteBodySchema.parse("  Geç kaldı.  "), "Geç kaldı.");
  assert.equal(noteBodySchema.parse("İğdır ışığı çözüldü"), "İğdır ışığı çözüldü");
});

test("noteBodySchema refuses empty and whitespace-only text", () => {
  assert.equal(noteBodySchema.safeParse("").success, false);
  assert.equal(noteBodySchema.safeParse("   ").success, false);
});

test("noteBodySchema allows 2,000 characters, not 2,001", () => {
  assert.equal(noteBodySchema.safeParse("a".repeat(2000)).success, true);
  assert.equal(noteBodySchema.safeParse("a".repeat(2001)).success, false);
});
