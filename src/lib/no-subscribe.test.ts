// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { noSubscribe } from "./no-subscribe.ts";

test("noSubscribe never calls the listener and returns an unsubscribe function", () => {
  let calls = 0;
  const unsubscribe = noSubscribe(() => calls++);
  assert.equal(typeof unsubscribe, "function");
  unsubscribe();
  assert.equal(calls, 0);
});
