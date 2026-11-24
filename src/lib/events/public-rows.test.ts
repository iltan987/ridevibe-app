import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePreviewRows, parseTeaserRows } from "./public-rows.ts";

test("teaser rows parse into rides", () => {
  assert.deepEqual(parseTeaserRows([{ day: "2026-12-01", title: "Şile", area: "Şile", side: "asian" }]), [
    { day: "2026-12-01", title: "Şile", area: "Şile", side: "asian" },
  ]);
  assert.deepEqual(parseTeaserRows([{ day: "2026-12-01", title: "Şile", area: "Şile", side: null }])[0]?.side, null);
  assert.deepEqual(parseTeaserRows([]), []);
});

test("a teaser row with an extra key is rejected (a widened RPC fails loudly)", () => {
  assert.throws(() =>
    parseTeaserRows([
      { day: "2026-12-01", title: "Şile", area: "Şile", side: "asian", starts_at: "2026-12-01T07:00Z" },
    ]),
  );
});

test("a malformed teaser result throws", () => {
  assert.throws(() => parseTeaserRows(null));
  assert.throws(() => parseTeaserRows([{ day: "1 Aralık", title: "x", area: "y", side: null }]));
  assert.throws(() => parseTeaserRows([{ day: "2026-12-01", title: "x", area: "y", side: "north" }]));
});

test("a preview row parses; no row is null", () => {
  assert.deepEqual(
    parsePreviewRows([{ kind: "meetup", title: "Buluşma", day: "2026-12-01", area: null, cancelled: true }]),
    { kind: "meetup", title: "Buluşma", day: "2026-12-01", area: null, cancelled: true },
  );
  assert.equal(parsePreviewRows([]), null);
});

test("a preview with an extra key or several rows is rejected", () => {
  const row = { kind: "ride", title: "x", day: "2026-12-01", area: "y", cancelled: false };
  assert.throws(() => parsePreviewRows([{ ...row, description: "secret" }]));
  assert.throws(() => parsePreviewRows([row, row]));
});
