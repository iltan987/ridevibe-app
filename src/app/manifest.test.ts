// Run with: pnpm test
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { THEME_COLORS } from "../lib/theme.ts";
import manifest from "./manifest.ts";

test("manifest icons exist and colours match the theme", () => {
  const m = manifest();
  assert.equal(m.background_color, THEME_COLORS.dark);
  assert.equal(m.theme_color, THEME_COLORS.dark);
  assert.ok(m.icons?.some((i) => i.purpose === "maskable"));
  for (const i of m.icons ?? []) assert.ok(existsSync(join("public", i.src)), i.src);
});
