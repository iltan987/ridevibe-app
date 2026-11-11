// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { accountDeleted } from "./account-deleted.ts";

test("accountDeleted: lookup succeeded without a profile row", () => {
  assert.equal(accountDeleted({ data: null, error: null }), true);
});

test("accountDeleted: profile row found", () => {
  assert.equal(accountDeleted({ data: { status: "active" }, error: null }), false);
});

test("accountDeleted: failed lookup is not proof (DB hiccup must not sign people out)", () => {
  assert.equal(accountDeleted({ data: null, error: { code: "57014" } }), false);
});
