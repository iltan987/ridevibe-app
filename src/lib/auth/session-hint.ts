// "Probably signed in" hint for skeletons in the static shell, which can't know the session. Only checks that a
// Supabase auth cookie exists (`sb-<ref>-auth-token`, chunked as `.0`, `.1`, …; readable from JS: @supabase/ssr sets
// httpOnly false); its value is never read. The proxy refreshes or clears the session cookies before the HTML is
// sent, so a stale cookie (circle skeleton, then "Giriş Yap") is rare. Stricter than the proxy's own check
// (`src/lib/supabase/proxy.ts` also matches `-code-verifier`, which must run the proxy but isn't a session); keep both.
// Dependency-free so `node --test` can load it and the skeleton can embed `markSessionHint` as an inline script.

export const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/;

export function hasSessionCookie(cookie: string): boolean {
  return SESSION_COOKIE.test(cookie);
}

/**
 * Runs as an inline script before first paint and marks an element with `data-session`: the one before it
 * (`sessionHintScript`, the user-menu skeleton) or, safer, the one it is the first child of (`sessionHintParentScript`:
 * it runs before any of that element's content is parsed, wherever the stream splits; docs/learnings/ui.md).
 * Stringified with `toString()`, so it must be self-contained: the regex comes in as an argument (a regex literal
 * stringifies to valid JS).
 */
function markSessionHint(doc: Document, sessionCookie: RegExp, parent: boolean): void {
  const script = doc.currentScript;
  const el = script && (parent ? script.parentElement : script.previousElementSibling);
  if (el && sessionCookie.test(doc.cookie)) el.setAttribute("data-session", "");
}

export const sessionHintScript = `(${markSessionHint.toString()})(document, ${SESSION_COOKIE.toString()}, false)`;
export const sessionHintParentScript = `(${markSessionHint.toString()})(document, ${SESSION_COOKIE.toString()}, true)`;
