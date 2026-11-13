// Browser-side twin of the (removed) SQL `private.search_fold`: Turkish letters to ASCII, then lower-case.
// Dependency-free so `node --test` can run its tests.

const FROM = "İIıÇçĞğÖöŞşÜü";
const TO = "iiiccggoossuu";
const MAP = new Map(Array.from(FROM, (c, i) => [c, TO[i]]));

export const SEARCH_MAX_LENGTH = 60;

export function foldSearch(value: string): string {
  return Array.from(value, (c) => MAP.get(c) ?? c).join("").toLowerCase();
}

/** Trims and cuts a raw search input to 60 code points, then trims again (idempotent: a space at the cut goes too). */
export function normalizeQuery(value: string | null | undefined): string {
  return Array.from((value ?? "").trim()).slice(0, SEARCH_MAX_LENGTH).join("").trim();
}

/** Both arguments already folded; an empty query matches everything. */
export function matchesFolded(foldedHaystack: string, foldedQuery: string): boolean {
  return foldedQuery === "" || foldedHaystack.includes(foldedQuery);
}
