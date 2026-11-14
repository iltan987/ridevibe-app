// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { deletionDate, deletionResult } from "./deletion-result.ts";

test("deletionResult: no error is ok", () => {
  assert.equal(deletionResult(null), "ok");
});

test("deletionResult: 55000 means the account is already being deleted", () => {
  assert.equal(deletionResult({ code: "55000" }), "alreadyDeleting");
});

test("deletionResult: 42501 is lastAdmin only with the last_admin hint", () => {
  assert.equal(deletionResult({ code: "42501", hint: "last_admin" }), "lastAdmin");
  assert.equal(deletionResult({ code: "42501" }), "error");
});

test("deletionResult: anything else is an error", () => {
  assert.equal(deletionResult({ code: "PGRST301" }), "error");
  assert.equal(deletionResult({}), "error");
});

test("deletionDate: 14 days after the request", () => {
  assert.equal(deletionDate("2026-11-14T10:00:00Z").toISOString(), "2026-11-28T10:00:00.000Z");
});
