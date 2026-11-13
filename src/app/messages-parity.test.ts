import assert from "node:assert/strict";
import { test } from "node:test";
import en from "../../messages/en.json" with { type: "json" };
import tr from "../../messages/tr.json" with { type: "json" };

function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key));
}

test("en.json and tr.json have the same message keys", () => {
  assert.deepEqual(keyPaths(en).sort(), keyPaths(tr).sort());
});
