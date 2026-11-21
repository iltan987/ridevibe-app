// What the upcoming-events list shows for a side, a kind, "Katıldıklarım" and a page — computed in the browser from
// the full list. Dependency-free so `node --test` can run its tests.

import { slicePage } from "../pagination.ts";

type Side = "asian" | "european";
type Kind = "meetup" | "ride";

/**
 * Filters keep the list's order. `mine` keeps the events whose id is in `joined`. Every chip counts what tapping it
 * would list: side counts honour the kind and `mine` filters, kind counts the side and `mine` filters, the `mine`
 * count the side and kind filters; `all` counts every event. Out-of-range pages are clamped.
 */
export function eventsView<T extends { id: string; side: Side | null; kind: Kind }>(
  events: T[],
  { side, kind, mine, page }: { side: Side | null; kind: Kind | null; mine: boolean; page: number },
  joined: ReadonlySet<string>,
) {
  // An event without a side belongs to both sides: it shows under either chip.
  const sideOk = (event: T) => side === null || event.side === null || event.side === side;
  const kindOk = (event: T) => kind === null || event.kind === kind;
  const isMine = (event: T) => joined.has(event.id);
  const mineOk = (event: T) => !mine || isMine(event);

  const counts = { all: events.length, asian: 0, european: 0, meetup: 0, ride: 0, mine: 0 };
  for (const event of events) {
    if (kindOk(event) && mineOk(event)) {
      if (event.side === null) {
        counts.asian += 1;
        counts.european += 1;
      } else {
        counts[event.side] += 1;
      }
    }
    if (sideOk(event) && mineOk(event)) counts[event.kind] += 1;
    if (sideOk(event) && kindOk(event) && isMine(event)) counts.mine += 1;
  }

  const visible = events.filter((event) => sideOk(event) && kindOk(event) && mineOk(event));
  return { counts, ...slicePage(visible, page) };
}
