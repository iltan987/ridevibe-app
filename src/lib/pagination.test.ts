// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  afterCursorFilter,
  decodeCursor,
  encodeCursor,
  ilikeContains,
  clampPage,
  pageCount,
  pageItems,
  parsePage,
  readAll,
  splitPage,
  toPage,
} from "./pagination.ts";

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

test("splitPage cuts the extra row and builds the cursor from the last item", () => {
  assert.deepEqual(splitPage([1, 2, 3], 3, String), { items: [1, 2, 3], nextCursor: null });
  assert.deepEqual(splitPage([1, 2, 3], 2, (n) => `c${n}`), { items: [1, 2], nextCursor: "c2" });
  assert.deepEqual(splitPage([], 2, String), { items: [], nextCursor: null });
});

test("parsePage accepts canonical positive integers only", () => {
  for (const [v, want] of [["1", 1], ["14", 14], [undefined, 1], ["0", 1], ["-3", 1], ["2.5", 1], ["1e3", 1],
    ["abc", 1], ["", 1], [" 2", 1], ["02", 1], [["2", "3"], 1], ["9999999", 1]] as const)
    assert.equal(parsePage(v), want, JSON.stringify(v));
});

test("clampPage / pageCount", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(25), 1);
  assert.equal(pageCount(26), 2);
  assert.equal(clampPage(99, 148), 6);
  assert.equal(clampPage(0, 148), 1);
  assert.equal(clampPage(3, 0), 1);
});

test("pageItems", () => {
  assert.deepEqual(pageItems(1, 1), [1]);
  assert.deepEqual(pageItems(3, 6), [1, 2, 3, 4, 5, 6]); // hidden 5 alone is shown, not "…"
  assert.deepEqual(pageItems(1, 6), [1, 2, "gap", 6]);
  assert.deepEqual(pageItems(6, 6), [1, "gap", 5, 6]);
  assert.deepEqual(pageItems(4, 6), [1, 2, 3, 4, 5, 6]); // gaps of one page are shown as numbers
  assert.deepEqual(pageItems(14, 80), [1, "gap", 13, 14, 15, "gap", 80]);
});

test("readAll reads chunks until a short one and flags the ceiling", async () => {
  const source = (n: number) => {
    const calls: [number, number][] = [];
    return {
      calls,
      fetch: async (from: number, to: number) => {
        calls.push([from, to]);
        return Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => from + i);
      },
    };
  };
  for (const [n, items, over, calls] of [[150, 150, false, 1], [1000, 1000, false, 2], [2000, 2000, false, 3],
    [2001, 2000, true, 3], [5000, 2000, true, 3]] as const) {
    const s = source(n);
    const r = await readAll(s.fetch, 2000, 1000);
    assert.equal(r.items.length, items);
    assert.equal(r.overCeiling, over);
    assert.equal(s.calls.length, calls);
    assert.ok(s.calls.every(([, to]) => to <= 2000), "never asks past ceiling + 1 rows");
  }
});
