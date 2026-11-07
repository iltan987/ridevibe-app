// Only allow same-site relative paths as post-login destinations, to prevent
// open redirects like `?next=//evil.example` or `?next=https://evil.example`.
export function safeNextPath(next: unknown, fallback = "/") {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
