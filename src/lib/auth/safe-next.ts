// Only allow same-site paths as post-login destinations, to prevent open
// redirects like `?next=//evil.example`, `?next=https://evil.example` or
// `?next=/\t/evil.example` (URL parsers silently drop tabs/newlines, turning
// that into `//evil.example`). We parse the value exactly like the browser
// will and return the normalized path, so what we checked is what we use.
const BASE = "https://same-origin.invalid";

export function safeNextPath(next: unknown, fallback = "/") {
  if (typeof next !== "string" || !next.startsWith("/")) return fallback;

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}

// The sign-in page in any locale (`/sign-in`, `/en/sign-in`), with or without a trailing slash.
const SIGN_IN_PATH = /^(?:\/[a-z]{2})?\/sign-in\/?$/;

/**
 * Where `/sign-in` sends a visitor who is already signed in (e.g. after signing in in another tab): the safe `next`,
 * or `fallback` (their account page) when it is missing, unsafe or the sign-in page itself.
 */
export function signedInDestination(next: unknown, fallback: string) {
  const path = safeNextPath(next, fallback);
  return SIGN_IN_PATH.test(new URL(path, BASE).pathname) ? fallback : path;
}
