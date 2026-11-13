// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addWrite,
  listQuery,
  listSearch,
  paramOff,
  rawParam,
  serverPage,
  shownSearch,
  syncedInput,
} from "./list-url.ts";
import { parsePage } from "./pagination.ts";

test("listSearch drops empty and default values", () => {
  assert.equal(listSearch({ q: "", side: null, page: 1 }, { page: 1 }), "");
  assert.equal(listSearch({ q: "ali veli", side: "asian", page: 2 }, { page: 1 }), "?q=ali+veli&side=asian&page=2");
  assert.equal(listSearch({ status: "pending", q: "ş" }, { status: "pending" }), "?q=%C5%9F");
});

test("listQuery is listSearch as an object (for Link / redirect hrefs)", () => {
  assert.deepEqual(listQuery({ status: "new", page: 1 }, { status: "new", page: 1 }), {});
  assert.deepEqual(listQuery({ status: "approved", page: 3, q: "" }, { status: "new", page: 1 }), {
    status: "approved",
    page: "3",
  });
});

test("paramOff: the raw URL value isn't how the value shown is written", () => {
  // Canonical: absent for null or the default, else the value as a string.
  assert.equal(paramOff(null, null), false);
  assert.equal(paramOff(undefined, "pending", "pending"), false);
  assert.equal(paramOff("asian", "asian"), false);
  assert.equal(paramOff("2", 2, 1), false);
  // Invalid (shown falls back), default spelled out, empty, repeated.
  assert.equal(paramOff("north", null), true);
  assert.equal(paramOff("", null), true);
  assert.equal(paramOff("pending", "pending", "pending"), true);
  assert.equal(paramOff("bogus", "pending", "pending"), true);
  assert.equal(paramOff("1", 1, 1), true);
  assert.equal(paramOff(["2", "3"], 1, 1), true);
  assert.equal(paramOff("99", 2, 1), true);
});

test("paramOff: a parameter the list never writes (stale ?cursor= bookmarks) is off whenever present", () => {
  assert.equal(paramOff(null, null), false);
  assert.equal(paramOff(undefined, null), false);
  assert.equal(paramOff("MjAyNi0xMS0wOFQxODozMTozNS42MTkxMjMrMDA6MDB8YWJj", null), true);
  assert.equal(paramOff("", null), true);
  assert.equal(paramOff(["a", "b"], null), true);
});

test("rawParam reads a key like the page's searchParams: null when absent, an array when repeated", () => {
  const params = new URLSearchParams("page=2&page=3&q=ali&empty=");
  assert.deepEqual(rawParam(params, "page"), ["2", "3"]);
  assert.equal(rawParam(params, "q"), "ali");
  assert.equal(rawParam(params, "empty"), "");
  assert.equal(rawParam(params, "side"), null);
  // A repeated ?page= is shown as page 1 and corrected, as on the server.
  assert.equal(parsePage(rawParam(params, "page")), 1);
  assert.equal(paramOff(rawParam(params, "page"), 1, 1), true);
});

test("shownSearch / addWrite: the list's own write until the router's copy of the URL catches up", () => {
  assert.equal(shownSearch("", null), "");
  assert.equal(shownSearch("q=ali", null), "q=ali");
  // A chip tap on ?q=ali: shown at once, while the router still says q=ali.
  const tap = addWrite(null, "q=ali", "?q=ali&side=asian");
  assert.deepEqual(tap, { from: ["q=ali"], search: "q=ali&side=asian" });
  assert.equal(shownSearch("q=ali", tap), "q=ali&side=asian");
  // Router caught up, or moved elsewhere (back/forward): the router's URL wins.
  assert.equal(shownSearch("q=ali&side=asian", tap), "q=ali&side=asian");
  assert.equal(shownSearch("", tap), "");
  // Clearing the search writes "" (no query at all).
  assert.equal(shownSearch("q=ali", addWrite(null, "q=ali", "")), "");
});

test("addWrite: fast writes never flip back when the router catches up one write at a time", () => {
  // Typing "a", "ab", "abc" faster than the router: it may still show "", then q=a, then q=ab.
  let pending = addWrite(null, "", "?q=a");
  pending = addWrite(pending, "", "?q=ab");
  pending = addWrite(pending, "", "?q=abc");
  for (const router of ["", "q=a", "q=ab"]) assert.equal(shownSearch(router, pending), "q=abc", router);
  assert.equal(shownSearch("q=abc", pending), "q=abc");
  // Writing again after the router reached q=a keeps the chain.
  assert.deepEqual(addWrite(pending, "q=a", "?q=abcd").from, ["", "q=a", "q=ab", "q=abc"]);
  // A write after the router moved elsewhere starts over.
  assert.deepEqual(addWrite(pending, "side=asian", "?side=asian&page=2"), { from: ["side=asian"], search: "side=asian&page=2" });
});

test("serverPage clamps ?page= to the list and flags URLs to correct", () => {
  // 30 rows = 2 pages of 25.
  assert.deepEqual(serverPage(undefined, 30), { page: 1, off: false });
  assert.deepEqual(serverPage("2", 30), { page: 2, off: false });
  assert.deepEqual(serverPage("99", 30), { page: 2, off: true });
  assert.deepEqual(serverPage("3", 30), { page: 2, off: true });
  for (const raw of ["abc", "0", "-3", "2.5", "1e3", "", "1", ["2", "3"]])
    assert.deepEqual(serverPage(raw, 30), { page: 1, off: true }, JSON.stringify(raw));
  // Empty list: page 1, no page in the URL.
  assert.deepEqual(serverPage(undefined, 0), { page: 1, off: false });
  assert.deepEqual(serverPage("2", 0), { page: 1, off: true });
});

test("syncedInput keeps the typed text while the URL value is unchanged", () => {
  const prev = { url: "ali", input: "alix" };
  assert.equal(syncedInput(prev, "ali"), prev);
});

test("syncedInput follows the URL when it changes (back/forward)", () => {
  assert.deepEqual(syncedInput({ url: "ali", input: "alix" }, ""), { url: "", input: "" });
});

test("syncedInput keeps the typed text when the URL catches up with it (own write, trimmed)", () => {
  // Typing "ali v" then deleting the "v": the URL becomes "ali"; the box keeps its trailing space.
  assert.deepEqual(syncedInput({ url: "ali v", input: "ali " }, "ali"), { url: "ali", input: "ali " });
  assert.deepEqual(syncedInput({ url: "", input: " ali" }, "ali"), { url: "ali", input: " ali" });
});
