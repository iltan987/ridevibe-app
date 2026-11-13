// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { foldSearch } from "../search-fold.ts";
import { directoryView } from "./directory-view.ts";

type M = { fullName: string; side: "asian" | "european" | null };

const members: M[] = [
  { fullName: "Cem Arslan", side: "asian" },
  { fullName: "Çelik Cem", side: "european" },
  { fullName: "İlker Işık", side: null },
  ...Array.from({ length: 27 }, (_, i): M => ({ fullName: `Üye ${i + 1}`, side: "asian" })),
];
const folded = members.map((m) => foldSearch(m.fullName));
const names = (items: M[]) => items.map((m) => m.fullName);

test("no query: every member, chip counts per side, first page of 25", () => {
  const view = directoryView(members, folded, { query: "", side: null, page: 1 });
  assert.deepEqual(view.counts, { all: 30, asian: 28, european: 1 });
  assert.equal(view.total, 30);
  assert.equal(view.items.length, 25);
  assert.deepEqual([view.page, view.pageCount, view.from, view.to], [1, 2, 1, 25]);
});

test("the query folds Turkish letters and case; counts honour it, the side doesn't change them", () => {
  const view = directoryView(members, folded, { query: "CEM", side: "european", page: 1 });
  assert.deepEqual(view.counts, { all: 2, asian: 1, european: 1 });
  assert.deepEqual(names(view.items), ["Çelik Cem"]);
  assert.equal(view.total, 1);
  assert.deepEqual(names(directoryView(members, folded, { query: "isik", side: null, page: 1 }).items), ["İlker Işık"]);
});

test("a side filter leaves out members without a side", () => {
  const view = directoryView(members, folded, { query: "", side: "asian", page: 1 });
  assert.equal(view.total, 28);
  assert.ok(!names(view.items).includes("İlker Işık"));
});

test("page 2 holds the rest; the range is 1-based", () => {
  const view = directoryView(members, folded, { query: "", side: null, page: 2 });
  assert.deepEqual(names(view.items), ["Üye 23", "Üye 24", "Üye 25", "Üye 26", "Üye 27"]);
  assert.deepEqual([view.from, view.to, view.total], [26, 30, 30]);
});

test("an out-of-range page is clamped to the last page", () => {
  const view = directoryView(members, folded, { query: "", side: null, page: 99 });
  assert.equal(view.page, 2);
  assert.equal(view.items.length, 5);
});

test("no match: no items, page 1, an empty range", () => {
  const view = directoryView(members, folded, { query: "zzz", side: null, page: 3 });
  assert.deepEqual(view.counts, { all: 0, asian: 0, european: 0 });
  assert.deepEqual([view.items.length, view.page, view.pageCount, view.from, view.to, view.total], [0, 1, 1, 0, 0, 0]);
});
