// "Probably signed in" hint for skeletons in the static shell, which can't know the session. Only checks that a
// Supabase auth cookie exists (`sb-<ref>-auth-token`, chunked as `.0`, `.1`, …; readable from JS: @supabase/ssr sets
// httpOnly false); its value is never read. An expired session still has the cookie, so the hint can be wrong (rare).
// Dependency-free so `node --test` can load it and the skeleton can embed `markSessionHint` as an inline script.

export function hasSessionCookie(cookie: string): boolean {
  return /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(cookie);
}

/**
 * Runs as an inline script directly after the skeleton, before first paint. Stringified with `toString()`, so it
 * must be self-contained (the regex duplicates `hasSessionCookie`; the vm test enforces this).
 */
function markSessionHint(doc: Document): void {
  const el = doc.currentScript && doc.currentScript.previousElementSibling;
  if (el && /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(doc.cookie)) el.setAttribute("data-session", "");
}

export const sessionHintScript = `(${markSessionHint.toString()})(document)`;
