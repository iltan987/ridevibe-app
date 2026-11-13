// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { listSearch } from "./list-url.ts";

test("listSearch drops empty and default values", () => {
  assert.equal(listSearch({ q: "", side: null, page: 1 }, { page: 1 }), "");
  assert.equal(listSearch({ q: "ali veli", side: "asian", page: 2 }, { page: 1 }), "?q=ali+veli&side=asian&page=2");
  assert.equal(listSearch({ status: "pending", q: "ş" }, { status: "pending" }), "?q=%C5%9F");
});
