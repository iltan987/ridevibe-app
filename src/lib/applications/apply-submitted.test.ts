// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  clearApplySubmitted,
  getApplySubmitted,
  markApplySubmitted,
  subscribeApplySubmitted,
} from "./apply-submitted.ts";

test("mark sets the flag, clear resets it", () => {
  assert.equal(getApplySubmitted(), false);
  markApplySubmitted();
  assert.equal(getApplySubmitted(), true);
  clearApplySubmitted();
  assert.equal(getApplySubmitted(), false);
});

test("subscribers are notified on changes only and can unsubscribe", () => {
  let calls = 0;
  const unsubscribe = subscribeApplySubmitted(() => {
    calls += 1;
  });
  markApplySubmitted();
  markApplySubmitted(); // no change, no notification
  assert.equal(calls, 1);
  clearApplySubmitted();
  assert.equal(calls, 2);
  unsubscribe();
  markApplySubmitted();
  assert.equal(calls, 2);
  clearApplySubmitted();
});
