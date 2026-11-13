// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { listSearch, syncedInput } from "./list-url.ts";

test("listSearch drops empty and default values", () => {
  assert.equal(listSearch({ q: "", side: null, page: 1 }, { page: 1 }), "");
  assert.equal(listSearch({ q: "ali veli", side: "asian", page: 2 }, { page: 1 }), "?q=ali+veli&side=asian&page=2");
  assert.equal(listSearch({ status: "pending", q: "ş" }, { status: "pending" }), "?q=%C5%9F");
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
