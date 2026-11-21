// What the upcoming-events list shows for a side, a kind and a page — computed in the browser from the full list.
// Dependency-free so `node --test` can run its tests.

import { slicePage } from "../pagination.ts";

type Side = "asian" | "european";
type Kind = "meetup" | "ride";

/**
 * Filters keep the list's order. Side counts honour the kind filter and kind counts the side filter (each chip shows
 * what tapping it would list); `all` counts every event. Out-of-range pages are clamped.
 */
export function eventsView<T extends { side: Side | null; kind: Kind }>(
  events: T[],
  { side, kind, page }: { side: Side | null; kind: Kind | null; page: number },
) {
  const sideOk = (event: T) => side === null || event.side === side;
  const kindOk = (event: T) => kind === null || event.kind === kind;

  const counts = { all: events.length, asian: 0, european: 0, meetup: 0, ride: 0 };
  for (const event of events) {
    if (event.side && kindOk(event)) counts[event.side] += 1;
    if (sideOk(event)) counts[event.kind] += 1;
  }

  const visible = events.filter((event) => sideOk(event) && kindOk(event));
  return { counts, ...slicePage(visible, page) };
}
