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
 * Upcoming events in the browser: side and kind chips and pages over the full list from the server, with the state
 * in the URL (`?side=…&kind=…&page=…`, defaults left out; chips and pages push a history entry, nothing goes to the
 * server). "Tümü" clears both filters; a pressed side or kind chip clears its own filter.
 */
export function EventsList({ events, overCeiling }: { events: EventSummary[]; overCeiling: boolean }) {
  const t = useTranslations("Events");
  const tSides = useTranslations("Members.sides");
  const params = useListParams();
  const side = oneOf(SIDES, params.get("side")) ?? null;
  const kind = oneOf(KINDS, params.get("kind")) ?? null;
  // Repeated (`?page=2&page=3`) reads as an array: shown as page 1 and corrected, like on the server.
  const rawPage = params.raw("page");
  const view = eventsView(events, { side, kind, page: parsePage(rawPage) });

  const urlValues = (changes: Record<string, string | number | null>) => ({ side, kind, page: view.page, ...changes });

  // A malformed or out-of-range ?page=, or an unknown ?side= / ?kind=, renders the corrected list: fix the URL to match.
  const urlOff =
    paramOff(rawPage, view.page, 1) || paramOff(params.raw("side"), side) || paramOff(params.raw("kind"), kind);
  useUrlFix(urlOff ? listSearch(urlValues({}), DEFAULTS) : null);

  const listTop = useRef<HTMLDivElement>(null);

  function onFilter(next: { side: Side | null; kind: Kind | null }) {
    if (next.side !== side || next.kind !== kind) params.push(urlValues({ ...next, page: null }), DEFAULTS);
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
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
      >
        <ListChip
          pressed={side === null && kind === null}
          count={view.counts.all}
          onClick={() => onFilter({ side: null, kind: null })}
        >
          {tSides("all")}
        </ListChip>
        {SIDES.map((s) => (
          <ListChip
            key={s}
            pressed={side === s}
            count={view.counts[s]}
            onClick={() => onFilter({ side: side === s ? null : s, kind })}
          >
            {tSides(s)}
          </ListChip>
        ))}
        <span aria-hidden className="w-px shrink-0 self-stretch bg-border" />
        {KINDS.map((k) => (
          <ListChip
            key={k}
            pressed={kind === k}
            count={view.counts[k]}
            onClick={() => onFilter({ side, kind: kind === k ? null : k })}
          >
            {t(`kinds.${k}`)}
          </ListChip>
        ))}
      </div>

      <div ref={listTop} className="scroll-mt-20">
        {view.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{events.length === 0 ? t("empty") : t("noResults")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {view.items.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
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
