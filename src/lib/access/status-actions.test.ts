// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { statusActions } from "./status-actions.ts";

const targets = (status: Parameters<typeof statusActions>[0]) => statusActions(status).map((a) => a.status);

test("each status offers its next steps", () => {
  assert.deepEqual(targets("pending"), ["probation"]);
  assert.deepEqual(targets("probation"), ["active", "inactive"]);
  assert.deepEqual(targets("active"), ["inactive"]);
  assert.deepEqual(targets("inactive"), ["probation", "active"]);
});

test("never pending → active, and never back to pending", () => {
  assert.ok(statusActions("pending").every((a) => a.status !== "active"));
  for (const s of ["pending", "probation", "active", "inactive"] as const) {
    assert.ok(statusActions(s).every((a) => a.status !== "pending" && a.status !== s));
  }
});

test("labels follow the target status; the first action is the primary one", () => {
  assert.deepEqual(
    statusActions("probation").map((a) => [a.label, a.primary]),
    [
      ["promote", true],
      ["deactivate", false],
    ],
  );
  assert.equal(statusActions("active")[0].primary, false);
  assert.equal(statusActions("pending")[0].label, "toProbation");
});
