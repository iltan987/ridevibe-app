// Theme preference logic. Dependency-free (no `@/` imports, no "use client") so `node --test` can load it and the
// server layout can embed `initTheme` as an inline script.

export type ThemePreference = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "theme";
export const THEME_COLORS = { dark: "#0B0D10", light: "#FBF5E5" } as const;

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseThemePreference(raw: unknown): ThemePreference {
  return raw === "system" || raw === "dark" || raw === "light" ? raw : "dark";
}

export function resolveTheme(pref: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (pref === "system") return systemPrefersDark ? "dark" : "light";
  return pref;
}

export function applyResolvedTheme(doc: Document, theme: ResolvedTheme): void {
  doc.documentElement.classList.toggle("dark", theme === "dark");
  // Every tag: after hydration Next adds its own theme-color meta next to the server-rendered one.
  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = THEME_COLORS[theme];
  });
}

/**
 * Runs as an inline script in <head> before first paint. It is stringified with `toString()`, so it must be fully
 * self-contained: no outer identifiers, constants inlined (the vm test enforces this). The two DOM lines duplicate
 * `applyResolvedTheme` for that reason.
 */
export function initTheme(
  doc: Document,
  storage: Pick<Storage, "getItem"> | null,
  matchMedia: ((q: string) => { matches: boolean }) | null,
): void {
  let pref = "dark";
  try {
    const raw = storage ? storage.getItem("theme") : null;
    if (raw === "system" || raw === "dark" || raw === "light") pref = raw;
  } catch {
    // storage unavailable → default
  }
  let dark = true;
  if (pref === "light") dark = false;
  else if (pref === "system") {
    try {
      dark = matchMedia ? matchMedia("(prefers-color-scheme: dark)").matches : true;
    } catch {
      dark = true;
    }
  }
  doc.documentElement.classList.toggle("dark", dark);
  doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = dark ? "#0B0D10" : "#FBF5E5";
  });
}

export const themeInitScript = `(${initTheme.toString()})(document, (function(){try{return localStorage}catch(e){return null}})(), window.matchMedia ? window.matchMedia.bind(window) : null)`;

export function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return "dark";
  }
}

/** Applies a preference to the page without persisting (mount, OS change). Persist only on a user choice. */
export function syncThemePreference(pref: ThemePreference): void {
  // matchMedia is only needed for "system"; missing → dark.
  const systemPrefersDark =
    pref === "system" && typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY).matches : true;
  applyResolvedTheme(document, resolveTheme(pref, systemPrefersDark));
}

/** The user's explicit choice: persist (swallowing storage errors), then apply. */
export function applyThemePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // private mode / blocked storage: still apply for this page view
  }
  syncThemePreference(pref);
}
