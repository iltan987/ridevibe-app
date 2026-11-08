import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync("src/app/globals.css", "utf8");

/** Collects `--name: #rrggbb` pairs from every top-level block with this selector. */
function tokens(selector: string): Map<string, string> {
  const result = new Map<string, string>();
  const block = new RegExp(`(?:^|\\n)\\s*${selector}\\s*\\{([^}]*)\\}`, "g");
  for (const [, body] of css.matchAll(block)) {
    for (const [, name, hex] of body.matchAll(
      /--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g,
    )) {
      result.set(name, hex);
    }
  }
  return result;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = [fg: string, bg: string];

const TEXT: Pair[] = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "secondary"],
  ["primary-foreground", "primary"],
  ["accent-text", "background"],
  ["accent-text", "card"],
  ["status-foreground", "status-muted"],
  ["destructive", "background"],
  ["destructive", "card"],
];
const UI: Pair[] = [
  ["input", "background"],
  ["input", "card"],
];
const UI_DARK_ONLY: Pair[] = [["primary", "background"]];

const themes = { light: tokens(":root"), dark: tokens("\\.dark") };

for (const [theme, values] of Object.entries(themes)) {
  const checks: [Pair[], number][] = [
    [TEXT, 4.5],
    [UI, 3],
    ...(theme === "dark" ? ([[UI_DARK_ONLY, 3]] as [Pair[], number][]) : []),
  ];

  test(`${theme}: every contrast token is defined as 6-digit hex`, () => {
    const names = new Set(checks.flatMap(([pairs]) => pairs.flat()));
    for (const name of names) {
      assert.ok(values.has(name), `${theme}: --${name} missing`);
    }
  });

  for (const [pairs, min] of checks) {
    for (const [fg, bg] of pairs) {
      test(`${theme}: ${fg} on ${bg} >= ${min}`, () => {
        const f = values.get(fg);
        const b = values.get(bg);
        assert.ok(f && b, `${theme}: ${fg}/${bg} missing`);
        const ratio = contrast(f, b);
        assert.ok(
          ratio >= min,
          `${theme}: ${fg} on ${bg} is ${ratio.toFixed(2)}, needs ${min}`,
        );
      });
    }
  }
}
