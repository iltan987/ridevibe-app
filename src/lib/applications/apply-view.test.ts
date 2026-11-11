// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyView } from "./apply-view.ts";

const APPLICATION_STATUSES = ["new", "contacted", "approved", "rejected", null] as const;

test("applyView: visitor or user without a profile row sees the form", () => {
  assert.equal(applyView(null, null), "form");
  assert.equal(applyView(undefined, null), "form");
});

test("applyView: pending applicant", () => {
  assert.equal(applyView("pending", null), "form");
  assert.equal(applyView("pending", "rejected"), "form");
  assert.equal(applyView("pending", "new"), "underReview");
  assert.equal(applyView("pending", "contacted"), "underReview");
  // Approval activates the account, so this is transient; the gate has always shown the form here.
  assert.equal(applyView("pending", "approved"), "form");
});

test("applyView: active members are already members, whatever the application", () => {
  for (const a of APPLICATION_STATUSES) assert.equal(applyView("active", a), "alreadyMember", String(a));
});

test("applyView: inactive members get the inactive notice, whatever the application", () => {
  for (const a of APPLICATION_STATUSES) assert.equal(applyView("inactive", a), "inactive", String(a));
});
