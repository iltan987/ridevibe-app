// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { foldSearch, matchesFolded, normalizeQuery } from "./search-fold.ts";

test("foldSearch mirrors the SQL fold", () => {
  assert.equal(foldSearch("ÇELİK Işık"), "celik isik");
  assert.equal(foldSearch("İlker IŞIK"), "ilker isik");
  assert.equal(foldSearch("Ğğ Öö Şş Üü"), "gg oo ss uu");
  assert.ok(matchesFolded(foldSearch("Çelik Cem"), foldSearch(normalizeQuery("  celik "))));
  assert.ok(matchesFolded(foldSearch("Zehra 50%_off"), foldSearch("50%")));
  assert.ok(matchesFolded("anything", ""));
  assert.equal(Array.from(normalizeQuery("ş".repeat(70))).length, 60);
});

test("normalizeQuery is idempotent: a space at the cut is trimmed too", () => {
  const raw = `${"a".repeat(59)} b`;
  const once = normalizeQuery(raw);
  assert.equal(once, "a".repeat(59));
  assert.equal(normalizeQuery(once), once);
  assert.equal(normalizeQuery("  ali  "), "ali");
});
