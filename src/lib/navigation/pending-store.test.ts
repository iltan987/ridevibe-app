// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { beginNavigation, getPendingCount, getServerPendingCount, subscribePending } from "./pending-store.ts";

test("begin/end counts pending links", () => {
  const endA = beginNavigation();
  const endB = beginNavigation();
  assert.equal(getPendingCount(), 2);
  endA();
  assert.equal(getPendingCount(), 1);
  endB();
  assert.equal(getPendingCount(), 0);
});

test("end is idempotent", () => {
  const end = beginNavigation();
  assert.equal(getPendingCount(), 1);
  end();
  end();
  assert.equal(getPendingCount(), 0);
});

test("subscribers are notified on every change and can unsubscribe", () => {
  let calls = 0;
  const unsubscribe = subscribePending(() => {
    calls += 1;
  });
  const end = beginNavigation();
  end();
  assert.equal(calls, 2);
  unsubscribe();
  const end2 = beginNavigation();
  assert.equal(calls, 2);
  end2();
  assert.equal(getPendingCount(), 0);
  assert.equal(getServerPendingCount(), 0);
});
