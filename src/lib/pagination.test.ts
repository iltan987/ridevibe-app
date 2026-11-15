// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chunks,
  decodeCursor,
  clampPage,
  pageCount,
  pageItems,
  parsePage,
  readAll,
  slicePage,
  toPage,
  uniqueById,
} from "./pagination.ts";

const id = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";

test("cursor round-trips (toPage encodes, decodeCursor parses)", () => {
  const rows = [
    { created_at: "2026-11-08T18:31:35.619123+00:00", id },
    { created_at: "2026-11-08T18:30:00+00:00", id: "00000000-0000-4000-8000-000000000000" },
  ];
  assert.deepEqual(decodeCursor(toPage(rows, 1).nextCursor), { createdAt: rows[0].created_at, id });
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

test("toPage returns a next cursor only when there are more rows", () => {
  const rows = [1, 2, 3].map((n) => ({ id: `${n}`, created_at: `t${n}` }));
  assert.deepEqual(toPage(rows, 3), { items: rows, nextCursor: null });
  assert.deepEqual(toPage([], 2), { items: [], nextCursor: null });
  const page = toPage(rows, 2);
  assert.equal(page.items.length, 2);
  assert.deepEqual(decodeCursor(page.nextCursor), null, "test rows aren't real timestamps/uuids");
  assert.ok(page.nextCursor);
  assert.equal(Buffer.from(page.nextCursor, "base64url").toString(), "t2|2");
});

test("parsePage accepts canonical positive integers only", () => {
  for (const [v, want] of [
    ["1", 1],
    ["14", 14],
    [undefined, 1],
    ["0", 1],
    ["-3", 1],
    ["2.5", 1],
    ["1e3", 1],
    ["abc", 1],
    ["", 1],
    [" 2", 1],
    ["02", 1],
    [["2", "3"], 1],
    ["9999999", 1],
  ] as const)
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
      fetch: (from: number, to: number) => {
        calls.push([from, to]);
        return Promise.resolve(Array.from({ length: Math.max(0, Math.min(to, n - 1) - from + 1) }, (_, i) => from + i));
      },
    };
  };
  for (const [n, items, over, calls] of [
    [150, 150, false, 1],
    [1000, 1000, false, 2],
    [2000, 2000, false, 3],
    [2001, 2000, true, 3],
    [5000, 2000, true, 3],
  ] as const) {
    const s = source(n);
    const r = await readAll(s.fetch, 2000, 1000);
    assert.equal(r.items.length, items);
    assert.equal(r.overCeiling, over);
    assert.equal(s.calls.length, calls);
    assert.ok(
      s.calls.every(([, to]) => to <= 2000),
      "never asks past ceiling + 1 rows",
    );
  }
});

test("uniqueById keeps the first row of each id, in order", () => {
  const rows = [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
    { id: "a", n: 3 },
    { id: "c", n: 4 },
  ];
  assert.deepEqual(uniqueById(rows), [
    { id: "a", n: 1 },
    { id: "b", n: 2 },
    { id: "c", n: 4 },
  ]);
  assert.deepEqual(uniqueById([]), []);
});

test("slicePage: the clamped page's items and a 1-based range", () => {
  const items = Array.from({ length: 30 }, (_, i) => i + 1);
  assert.deepEqual(slicePage(items, 2), {
    items: [26, 27, 28, 29, 30],
    page: 2,
    pageCount: 2,
    total: 30,
    from: 26,
    to: 30,
  });
  assert.equal(slicePage(items, 1).items.length, 25);
  assert.deepEqual(slicePage(items, 99).page, 2);
  assert.deepEqual(slicePage([], 3), { items: [], page: 1, pageCount: 1, total: 0, from: 0, to: 0 });
});

test("chunks splits into pieces of at most `size`", () => {
  assert.deepEqual(chunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunks([1, 2], 2), [[1, 2]]);
  assert.deepEqual(chunks([], 2), []);
  assert.equal(
    chunks(
      Array.from({ length: 2001 }, (_, i) => i),
      1000,
    ).length,
    3,
  );
});

test("chunks rejects a size below 1 (would loop forever)", () => {
  for (const size of [0, -1, 0.5, Number.NaN]) assert.throws(() => chunks([1, 2], size), RangeError, String(size));
});
