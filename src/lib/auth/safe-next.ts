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
