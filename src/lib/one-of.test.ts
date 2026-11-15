// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { oneOf } from "./one-of.ts";

const OPTIONS = ["a", "b"] as const;

test("oneOf: a member comes back as is", () => {
  assert.equal(oneOf(OPTIONS, "b"), "b");
});

test("oneOf: a non-member → undefined", () => {
  assert.equal(oneOf(OPTIONS, "c"), undefined);
});

test("oneOf: a non-string → undefined", () => {
  assert.equal(oneOf(OPTIONS, 1), undefined);
  assert.equal(oneOf(OPTIONS, null), undefined);
  assert.equal(oneOf(OPTIONS, undefined), undefined);
  assert.equal(oneOf(OPTIONS, ["a"]), undefined);
});
