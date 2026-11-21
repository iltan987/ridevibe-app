import { isAllowedMapUrl, isShortMapUrl, type ParsedPlace, parsePlaceInput, toUrl } from "./place-input.ts";

// Reads a pasted place on the server, following short map links (maps.app.goo.gl/…) to the full link. SSRF boundary:
// only allow-listed https map hosts are ever requested, redirects are followed by hand and every hop is re-checked
// before it is requested. Privacy: the input and every `Location` can hold the sharer's own position (route links),
// so nothing here logs them or keeps them; failures log a reason code only. Dependency-free for `node --test`.

export type ResolvePlaceResult = { status: "ok"; place: ParsedPlace } | { status: "invalid" | "unresolved" };

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

type Reason = "timeout" | "fetch" | "noRedirect" | "badLocation" | "offList" | "unparsed" | "tooManyRedirects";

function unresolved(reason: Reason): ResolvePlaceResult {
  console.error("resolvePlace failed", { reason });
  return { status: "unresolved" };
}

export async function resolvePlace(text: string, fetchImpl: typeof fetch = fetch): Promise<ResolvePlaceResult> {
  const direct = parsePlaceInput(text);
  if (direct !== null) return { status: "ok", place: direct };
  let url = toUrl(text);
  if (url === null || !isShortMapUrl(url)) return { status: "invalid" };

  // One deadline for the whole chain.
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await fetchImpl(url.href, { redirect: "manual", signal, credentials: "omit" });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return unresolved(timedOut ? "timeout" : "fetch");
    }
    // Only the status and the Location header matter; release the connection.
    void response.body?.cancel().catch(() => undefined);
    const location = response.headers.get("location");
    if (response.status < 300 || response.status > 399 || location === null) return unresolved("noRedirect");
    let next: URL;
    try {
      next = new URL(location, url);
    } catch {
      return unresolved("badLocation");
    }
    if (!isAllowedMapUrl(next)) return unresolved("offList");
    if (!isShortMapUrl(next)) {
      const place = parsePlaceInput(next.href);
      return place === null ? unresolved("unparsed") : { status: "ok", place };
    }
    url = next;
  }
  return unresolved("tooManyRedirects");
}
