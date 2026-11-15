// Builds the query string of a list URL, leaving out empty and default values (clean, shareable URLs).
// Dependency-free so `node --test` can run its tests.

import { clampPage, parsePage } from "./pagination.ts";
import { normalizeQuery } from "./search-fold.ts";

type Values = Record<string, string | number | null | undefined>;
type Defaults = Record<string, string | number>;

/** The list URL's query as an object (for `Link` / `redirect` hrefs). */
export function listQuery(values: Values, defaults: Defaults): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    if (key in defaults && String(defaults[key]) === String(value)) continue;
    query[key] = String(value);
  }
  return query;
}

/** The list URL's query string (`?…`, or "" when everything is default). */
export function listSearch(values: Values, defaults: Defaults): string {
  const query = new URLSearchParams(listQuery(values, defaults)).toString();
  return query ? `?${query}` : "";
}

/**
 * True when a raw URL value isn't how the value shown is written (absent for null or the default `fallback`, else
 * the value as a string): invalid, empty, repeated or the default spelled out. Such URLs get corrected.
 */
export function paramOff(
  raw: string | string[] | null | undefined,
  shown: string | number | null,
  fallback?: string | number,
): boolean {
  const canonical =
    shown === null || (fallback !== undefined && String(shown) === String(fallback)) ? null : String(shown);
  return (raw ?? null) !== canonical;
}

/** A URL key as the page's server-side `searchParams` gives it: null when absent, an array when repeated. */
export function rawParam(params: { getAll(key: string): string[] }, key: string): string | string[] | null {
  const values = params.getAll(key);
  return values.length > 1 ? values : (values[0] ?? null);
}

/**
 * A list's own History API writes the router hasn't caught up with yet: `search` = the last one, `from` = the
 * router's query strings it may still show on the way there (where the first write started, then each earlier write).
 */
export type PendingWrite = { from: string[]; search: string };

/**
 * The query string (no `?`) a browser-filtered list renders from. After a History API write, the router's copy of
 * the URL (`useSearchParams`) catches up in a transition, a frame later on screen, and after fast writes possibly
 * one write at a time: while it shows a URL from `from`, show the last write, so a tap or key changes the list in the
 * same frame and never flips back. Any other router URL (caught up, or back/forward) wins.
 */
export function shownSearch(routerSearch: string, pending: PendingWrite | null): string {
  return pending && pending.from.includes(routerSearch) ? pending.search : routerSearch;
}

/** The pending write after writing `search` (from `listSearch`) while the router shows `routerSearch`. */
export function addWrite(pending: PendingWrite | null, routerSearch: string, search: string): PendingWrite {
  const from = pending && pending.from.includes(routerSearch) ? [...pending.from, pending.search] : [routerSearch];
  return { from, search: new URLSearchParams(search).toString() };
}

/**
 * `?page=` of a list paginated on the server with `total` rows: the page to show (clamped) and whether the URL must
 * be corrected (malformed, `1` spelled out, repeated or past the last page).
 */
export function serverPage(raw: string | string[] | undefined, total: number): { page: number; off: boolean } {
  const page = clampPage(parsePage(raw), total);
  return { page, off: paramOff(raw, page, 1) };
}

/**
 * Store-previous-value helper: the search box text follows the URL value when that changes (back/forward).
 * `prev.url` is the URL value last seen, not the one just written: on typing, update only `input`. When the URL
 * then catches up with the typed text (`normalizeQuery(input)`), the text stays as typed (keeps e.g. a trailing space).
 */
export function syncedInput(prev: { url: string; input: string }, urlValue: string): { url: string; input: string } {
  if (urlValue === prev.url) return prev;
  return { url: urlValue, input: normalizeQuery(prev.input) === urlValue ? prev.input : urlValue };
}
