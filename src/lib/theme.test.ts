// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  THEME_COLORS,
  applyResolvedTheme,
  applyThemePreference,
  syncThemePreference,
  initTheme,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  themeInitScript,
} from "./theme.ts";

function fakeDoc(initialDark = true) {
  const classes = new Set<string>(initialDark ? ["dark"] : []);
  const meta = { content: "" };
  const doc = {
    documentElement: {
      classList: {
        toggle(name: string, force?: boolean) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
        contains: (name: string) => classes.has(name),
      },
    },
    querySelector: (sel: string) => (sel === 'meta[name="theme-color"]' ? meta : null),
  };
  return { doc: doc as unknown as Document, classes, meta };
}

const media = (matches: boolean) => () => ({ matches });
const storageOf = (value: string | null) => ({ getItem: (key: string) => (key === "theme" ? value : null) });

test("parseThemePreference defaults to dark", () => {
  for (const v of [null, undefined, "", "blue", "DARK", 1, {}]) assert.equal(parseThemePreference(v), "dark");
  for (const v of ["system", "dark", "light"]) assert.equal(parseThemePreference(v), v);
});

test("resolveTheme", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("applyResolvedTheme toggles class and theme-color", () => {
  const { doc, classes, meta } = fakeDoc(true);
  applyResolvedTheme(doc, "light");
  assert.equal(classes.has("dark"), false);
  assert.equal(meta.content, THEME_COLORS.light);
  applyResolvedTheme(doc, "dark");
  assert.equal(classes.has("dark"), true);
  assert.equal(meta.content, THEME_COLORS.dark);
});

test("initTheme: nothing stored → dark + dark theme-color", () => {
  const { doc, classes, meta } = fakeDoc(false);
  initTheme(doc, storageOf(null), media(false));
  assert.equal(classes.has("dark"), true);
  assert.equal(meta.content, "#0B0D10");
});

test("initTheme: 'light' stored → no dark class, meta #FBF5E5", () => {
  const { doc, classes, meta } = fakeDoc(true);
  initTheme(doc, storageOf("light"), media(true));
  assert.equal(classes.has("dark"), false);
  assert.equal(meta.content, "#FBF5E5");
});

test("initTheme: 'system' + prefers light → light; prefers dark → dark", () => {
  const a = fakeDoc(true);
  initTheme(a.doc, storageOf("system"), media(false));
  assert.equal(a.classes.has("dark"), false);
  assert.equal(a.meta.content, "#FBF5E5");
  const b = fakeDoc(false);
  initTheme(b.doc, storageOf("system"), media(true));
  assert.equal(b.classes.has("dark"), true);
});

test("initTheme: storage throws / storage null / matchMedia null → dark, no throw", () => {
  const throwing = {
    getItem: () => {
      throw new Error("denied");
    },
  };
  const a = fakeDoc(false);
  initTheme(a.doc, throwing, media(false));
  assert.equal(a.classes.has("dark"), true);
  const b = fakeDoc(false);
  initTheme(b.doc, null, media(false));
  assert.equal(b.classes.has("dark"), true);
  const c = fakeDoc(true);
  initTheme(c.doc, storageOf("system"), null);
  assert.equal(c.classes.has("dark"), true);
  assert.equal(c.meta.content, "#0B0D10");
});

test("themeInitScript evaluates in node:vm with fakes and applies 'light'", () => {
  const { doc, classes, meta } = fakeDoc(true);
  const sandbox = {
    document: doc,
    localStorage: storageOf("light"),
    window: { matchMedia: media(true) },
  };
  vm.runInNewContext(themeInitScript, sandbox);
  assert.equal(classes.has("dark"), false);
  assert.equal(meta.content, "#FBF5E5");
});

test("readThemePreference is dark without window", () => {
  assert.equal(readThemePreference(), "dark");
});

function withGlobals(globals: Record<string, unknown>, fn: () => void) {
  const g = globalThis as Record<string, unknown>;
  const saved = Object.keys(globals).map((k) => [k, Object.getOwnPropertyDescriptor(g, k)] as const);
  for (const [k, v] of Object.entries(globals)) Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  try {
    fn();
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(g, k, d);
      else delete g[k];
    }
  }
}

test("applyThemePreference: setItem throwing still applies the theme", () => {
  const { doc, classes, meta } = fakeDoc(true);
  withGlobals(
    {
      window: { matchMedia: media(true) },
      document: doc,
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      },
    },
    () => applyThemePreference("light"),
  );
  assert.equal(classes.has("dark"), false);
  assert.equal(meta.content, "#FBF5E5");
});

test("applyThemePreference persists and readThemePreference reads it back", () => {
  const { doc } = fakeDoc(true);
  const store = new Map<string, string>();
  withGlobals(
    {
      window: { matchMedia: media(false) },
      document: doc,
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    },
    () => {
      applyThemePreference("system");
      assert.equal(readThemePreference(), "system");
    },
  );
});

test("syncThemePreference applies without persisting (nothing stored stays empty)", () => {
  const { doc, classes } = fakeDoc(false);
  const writes: string[] = [];
  withGlobals(
    {
      window: { matchMedia: media(false) },
      document: doc,
      localStorage: {
        getItem: () => null,
        setItem: (k: string) => void writes.push(k),
      },
    },
    () => {
      syncThemePreference(readThemePreference());
      assert.equal(readThemePreference(), "dark");
    },
  );
  assert.equal(classes.has("dark"), true);
  assert.deepEqual(writes, []);
});

test("explicit light with no matchMedia applies light without throwing", () => {
  const { doc, classes } = fakeDoc(true);
  withGlobals({ window: {}, document: doc, localStorage: { getItem: () => null, setItem: () => {} } }, () => {
    applyThemePreference("light");
    syncThemePreference("system"); // missing matchMedia → dark
  });
  assert.equal(classes.has("dark"), true);
  const again = fakeDoc(true);
  withGlobals({ window: {}, document: again.doc, localStorage: { getItem: () => null, setItem: () => {} } }, () =>
    syncThemePreference("light"),
  );
  assert.equal(again.classes.has("dark"), false);
  assert.equal(again.meta.content, "#FBF5E5");
});
