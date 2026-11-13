// Builds the query string of a list URL, leaving out empty and default values (clean, shareable URLs).
// Dependency-free so `node --test` can run its tests.

import { normalizeQuery } from "./search-fold.ts";

export function listSearch(
  values: Record<string, string | number | null | undefined>,
  defaults: Record<string, string | number>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "") continue;
    if (key in defaults && String(defaults[key]) === String(value)) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

/**
 * Store-previous-value helper: the search box text follows the URL value when that changes (back/forward).
 * `prev.url` is the URL value last seen, not the one just written: on typing, update only `input`. When the URL
 * then catches up with the typed text (`normalizeQuery(input)`), the text stays as typed (keeps e.g. a trailing space).
 */
export function syncedInput(
  prev: { url: string; input: string },
  urlValue: string,
): { url: string; input: string } {
  if (urlValue === prev.url) return prev;
  return { url: urlValue, input: normalizeQuery(prev.input) === urlValue ? prev.input : urlValue };
}
