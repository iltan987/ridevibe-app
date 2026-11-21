"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import { EventCard } from "@/components/events/event-card";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { ListChip } from "@/components/lists/list-chip";
import { useListParams } from "@/components/lists/use-list-params";
import { scrollToListTop, useUrlFix } from "@/components/lists/use-list-search";
import { PagerButtons } from "@/components/pager-buttons";
import { Link } from "@/i18n/navigation";
import { eventsView } from "@/lib/events/events-view";
import { type Counts, NO_COUNTS } from "@/lib/events/join";
import type { EventSummary } from "@/lib/events/queries";
import { listSearch, paramOff } from "@/lib/list-url";
import { oneOf } from "@/lib/one-of";
import { parsePage } from "@/lib/pagination";

const SIDES = ["asian", "european"] as const;
const KINDS = ["meetup", "ride"] as const;
const DEFAULTS = { page: 1 };

type Side = (typeof SIDES)[number];
type Kind = (typeof KINDS)[number];

/**
 * Upcoming events in the browser: side, kind and "Katıldıklarım" chips and pages over the full list from the server,
 * with the state in the URL (`?side=…&kind=…&mine=1&page=…`, defaults left out; chips and pages push a history entry,
 * nothing goes to the server). "Tümü" clears every filter; a pressed chip clears its own filter. `counts` by event id
 * (the counts line of each card), `joined`: the ids of the viewer's own sign-ups.
 */
export function EventsList({
  events,
  counts,
  joined,
  overCeiling,
}: {
  events: EventSummary[];
  counts: Partial<Record<string, Counts>>;
  joined: string[];
  overCeiling: boolean;
}) {
  const t = useTranslations("Events");
  const tSides = useTranslations("Members.sides");
  const params = useListParams();
  const side = oneOf(SIDES, params.get("side")) ?? null;
  const kind = oneOf(KINDS, params.get("kind")) ?? null;
  const mine = params.get("mine") === "1";
  const joinedIds = new Set(joined);
  // Repeated (`?page=2&page=3`) reads as an array: shown as page 1 and corrected, like on the server.
  const rawPage = params.raw("page");
  const view = eventsView(events, { side, kind, mine, page: parsePage(rawPage) }, joinedIds);

  const urlValues = (changes: Record<string, string | number | null>) => ({
    side,
    kind,
    mine: mine ? 1 : null,
    page: view.page,
    ...changes,
  });

  // A malformed or out-of-range ?page=, or an unknown ?side= / ?kind= / ?mine=, renders the corrected list: fix the URL
  // to match.
  const urlOff =
    paramOff(rawPage, view.page, 1) ||
    paramOff(params.raw("side"), side) ||
    paramOff(params.raw("kind"), kind) ||
    paramOff(params.raw("mine"), mine ? 1 : null);
  useUrlFix(urlOff ? listSearch(urlValues({}), DEFAULTS) : null);

  const listTop = useRef<HTMLDivElement>(null);

  function onFilter(next: { side: Side | null; kind: Kind | null; mine: boolean }) {
    if (next.side === side && next.kind === kind && next.mine === mine) return;
    params.push(urlValues({ side: next.side, kind: next.kind, mine: next.mine ? 1 : null, page: null }), DEFAULTS);
  }

  function onPage(next: number) {
    if (next === view.page) return;
    params.push(urlValues({ page: next }), DEFAULTS);
    scrollToListTop(listTop.current);
  }

  return (
    <>
      <div data-skeleton-result="events-total" className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("upcomingTotal", { count: events.length })}</p>
        <Link href="/events/past" className="font-medium text-accent-text hover:underline">
          {t("pastLink")}
        </Link>
      </div>

      {overCeiling && <CeilingNotice>{t("ceiling")}</CeilingNotice>}

      <div
        role="group"
        aria-label={t("filtersLabel")}
        data-skeleton-result="events-chips"
        className="flex flex-wrap gap-x-4 gap-y-2"
      >
        {/* Two groups that wrap as a whole: one row on wide screens, sides above kinds on a phone (no hidden chips). */}
        <div className="flex flex-wrap gap-2">
          <ListChip
            pressed={side === null && kind === null && !mine}
            count={view.counts.all}
            onClick={() => onFilter({ side: null, kind: null, mine: false })}
          >
            {tSides("all")}
          </ListChip>
          {SIDES.map((s) => (
            <ListChip
              key={s}
              pressed={side === s}
              count={view.counts[s]}
              onClick={() => onFilter({ side: side === s ? null : s, kind, mine })}
            >
              {tSides(s)}
            </ListChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <ListChip
              key={k}
              pressed={kind === k}
              count={view.counts[k]}
              onClick={() => onFilter({ side, kind: kind === k ? null : k, mine })}
            >
              {t(`kinds.${k}`)}
            </ListChip>
          ))}
          <ListChip pressed={mine} count={view.counts.mine} onClick={() => onFilter({ side, kind, mine: !mine })}>
            {t("mineChip")}
          </ListChip>
        </div>
      </div>

      <div ref={listTop} className="scroll-mt-20">
        {view.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{events.length === 0 ? t("empty") : t("noResults")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.items.map((event) => (
              <li key={event.id}>
                <EventCard event={event} counts={counts[event.id] ?? NO_COUNTS} joined={joinedIds.has(event.id)} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {view.total > 0 && (
        <PagerButtons
          page={view.page}
          pageCount={view.pageCount}
          rangeLabel={t("range", { from: view.from, to: view.to, total: view.total })}
          onPage={onPage}
        />
      )}
    </>
  );
}
