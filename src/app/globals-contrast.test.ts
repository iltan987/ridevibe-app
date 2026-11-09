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

/** Effective colour of `overlay` drawn at `alpha` over `base` (what a `bg-token/NN` tint looks like). */
function blend(overlay: string, base: string, alpha: number): string {
  const channel = (i: number) => {
    const o = parseInt(overlay.slice(i, i + 2), 16);
    const b = parseInt(base.slice(i, i + 2), 16);
    return Math.round(o * alpha + b * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

type Pair = [fg: string, bg: string];

// Tint alphas of the destructive variant in `button.tsx` / `badge.tsx` (normal, hover) per theme. Keep in sync.
const DESTRUCTIVE_TINT = { light: [0.1, 0.15], dark: [0.15, 0.2] } as const;
// Outline button background in dark (`dark:bg-input/30`, hover `dark:hover:bg-input/35`); light uses plain background/muted.
const OUTLINE_INPUT_TINT_DARK = [0.3, 0.35] as const;

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
  ["ring", "background"],
  ["ring", "card"],
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

for (const [theme, values] of Object.entries(themes)) {
  const get = (name: string) => {
    const hex = values.get(name);
    assert.ok(hex, `${theme}: --${name} missing`);
    return hex;
  };
  const destructive = () => get("destructive");

  for (const base of ["card", "popover", "background"]) {
    for (const alpha of DESTRUCTIVE_TINT[theme as "light" | "dark"]) {
      test(`${theme}: destructive text on destructive/${alpha * 100} over ${base} >= 4.5`, () => {
        const bg = blend(destructive(), get(base), alpha);
        const ratio = contrast(destructive(), bg);
        assert.ok(ratio >= 4.5, `${theme}: ${ratio.toFixed(2)} on tint ${alpha} over ${base}`);
      });
    }
  }

  if (theme === "dark") {
    for (const alpha of OUTLINE_INPUT_TINT_DARK) {
      test(`dark: destructive text on input/${alpha * 100} over card >= 4.5`, () => {
        const ratio = contrast(destructive(), blend(get("input"), get("card"), alpha));
        assert.ok(ratio >= 4.5, `dark: ${ratio.toFixed(2)}`);
      });
    }
  }
}
