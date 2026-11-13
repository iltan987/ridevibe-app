import assert from "node:assert/strict";
import { test } from "node:test";
import { localizedUrl, ogLocale } from "./site.ts";

test("localizedUrl: Turkish is the root, English sits under /en", () => {
  assert.equal(localizedUrl("tr", "/"), "https://ridevibe.com.tr/");
  assert.equal(localizedUrl("en", "/"), "https://ridevibe.com.tr/en");
  assert.equal(localizedUrl("tr", "/apply"), "https://ridevibe.com.tr/apply");
  assert.equal(localizedUrl("en", "/apply"), "https://ridevibe.com.tr/en/apply");
});

test("ogLocale maps to Open Graph locale codes", () => {
  assert.equal(ogLocale("tr"), "tr_TR");
  assert.equal(ogLocale("en"), "en_US");
});
