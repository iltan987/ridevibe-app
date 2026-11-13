// What the member directory shows for a search, side and page — computed in the browser from the full list.
// Dependency-free so `node --test` can run its tests.

import { slicePage } from "../pagination.ts";
import { foldSearch, matchesFolded } from "../search-fold.ts";

type Side = "asian" | "european";

/**
 * `folded[i]` is `foldSearch(members[i].fullName)` (fold once per list, not per keystroke); `query` is normalized.
 * Chip counts honour the search and ignore the side; out-of-range pages are clamped.
 */
export function directoryView<T extends { side: Side | null }>(
  members: T[],
  folded: string[],
  { query, side, page }: { query: string; side: Side | null; page: number },
) {
  const foldedQuery = foldSearch(query);
  const matched = members.filter((_, i) => matchesFolded(folded[i], foldedQuery));
  const counts = { all: matched.length, asian: 0, european: 0 };
  for (const member of matched) if (member.side) counts[member.side] += 1;

  const visible = side ? matched.filter((member) => member.side === side) : matched;
  return { counts, ...slicePage(visible, page) };
}
