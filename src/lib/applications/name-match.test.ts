// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { nameMatchScore, sortByNameMatch } from "./name-match.ts";

test("matches Turkish letters and case-insensitively", () => {
  assert.equal(nameMatchScore("ŞEYMA ÖZTÜRK", "seyma ozturk"), 2);
  assert.equal(nameMatchScore("İlkay Işık", "ilkay isik"), 2);
});

test("scores unrelated names 0", () => {
  assert.equal(nameMatchScore("Ali Veli", "Mehmet Can"), 0);
});

test("ignores one-letter tokens such as initials", () => {
  assert.equal(nameMatchScore("Seyma O.", "Şeyma Öztürk"), 1);
});

test("sorts best match first and keeps original order on ties", () => {
  const items = ["Ahmet Kaya", "Seyma O.", "Can Yildiz"];
  assert.deepEqual(
    sortByNameMatch(items, "Şeyma Öztürk", (n) => n),
    ["Seyma O.", "Ahmet Kaya", "Can Yildiz"],
  );
  assert.deepEqual(items, ["Ahmet Kaya", "Seyma O.", "Can Yildiz"]);
});
