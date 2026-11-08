// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { afterCursorFilter, decodeCursor, encodeCursor, ilikeContains, toPage } from "./pagination.ts";

const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

test("cursor round-trips", () => {
  const cursor = { createdAt: "2026-11-08T18:31:35.619123+00:00", id };
  assert.deepEqual(decodeCursor(encodeCursor(cursor)), cursor);
});

test("rejects malformed or hostile cursors", () => {
  const enc = (s: string) => Buffer.from(s).toString("base64url");
  for (const value of [
    undefined,
    ["x"],
    "",
    "not-base64-%%%",
    enc(`2026-11-08T18:31:35Z|${id}|extra`),
    enc(`2026-11-08T18:31:35Z|not-a-uuid`),
    enc(`2026-11-08T18:31:35Z),or(id.gt.0|${id}`),
    "a".repeat(201),
  ]) {
    assert.equal(decodeCursor(value), null, JSON.stringify(value));
  }
});

test("filter selects rows after the cursor", () => {
  assert.equal(
    afterCursorFilter({ createdAt: "2026-11-08T18:31:35Z", id }),
    `created_at.lt."2026-11-08T18:31:35Z",and(created_at.eq."2026-11-08T18:31:35Z",id.lt.${id})`,
  );
});

test("toPage returns a next cursor only when there are more rows", () => {
  const rows = [1, 2, 3].map((n) => ({ id: `${n}`, created_at: `t${n}` }));
  assert.deepEqual(toPage(rows, 3), { items: rows, nextCursor: null });
  const page = toPage(rows, 2);
  assert.equal(page.items.length, 2);
  assert.deepEqual(decodeCursor(page.nextCursor), null, "test rows aren't real timestamps/uuids");
  assert.equal(Buffer.from(page.nextCursor!, "base64url").toString(), "t2|2");
});

test("ilikeContains escapes wildcards", () => {
  assert.equal(ilikeContains("50%_a\\b"), "%50\\%\\_a\\\\b%");
});
