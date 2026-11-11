// Guess whether the "Başvur" nav item is hidden, for the static shell, which can't know the session. No session
// cookie → show; session cookie → hide unless the last known answer (localStorage, written once the session has
// streamed in) is exactly "0" (shown). Dependency-free so `node --test` can load it and the nav can embed
// `markApplyHint` as an inline script that runs before first paint.

import { SESSION_COOKIE } from "../auth/session-hint.ts";

const APPLY_HINT_KEY = "rv-apply-hidden";

export function guessApplyHidden(hasSession: boolean, stored: string | null): boolean {
  return hasSession && stored !== "0";
}

/** The stored answer, or null when there is none or storage is unavailable (privacy mode, blocked cookies). */
export function readApplyHint(getStorage: () => Pick<Storage, "getItem">): string | null {
  try {
    return getStorage().getItem(APPLY_HINT_KEY);
  } catch {
    return null;
  }
}

export function writeApplyHint(getStorage: () => Pick<Storage, "setItem">, hidden: boolean): void {
  try {
    getStorage().setItem(APPLY_HINT_KEY, hidden ? "1" : "0");
  } catch {
    // storage unavailable or full: the next visit simply guesses again
  }
}

/**
 * Runs as an inline script directly after the nav list, before first paint. Stringified with `toString()`, so it
 * must be self-contained: the regex and key come in as arguments, and the guess is repeated here (`guessApplyHidden`
 * can't be referenced); the parity test in `apply-hint.test.ts` guards against drift.
 */
function markApplyHint(doc: Document, sessionCookie: RegExp, key: string): void {
  const el = doc.currentScript && doc.currentScript.previousElementSibling;
  if (!el || !sessionCookie.test(doc.cookie)) return;
  let stored: string | null = null;
  try {
    stored = doc.defaultView!.localStorage.getItem(key);
  } catch {
    // storage unavailable: guess hidden
  }
  if (stored !== "0") el.setAttribute("data-apply-hidden", "");
}

export const applyHintScript = `(${markApplyHint.toString()})(document, ${SESSION_COOKIE}, ${JSON.stringify(APPLY_HINT_KEY)})`;
