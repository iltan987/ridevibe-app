"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { scrollToListTop } from "@/components/lists/use-list-search";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { PagerButtons } from "@/components/pager-buttons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { DeclinerRow } from "@/lib/events/queries";
import { initials } from "@/lib/initials";
import { slicePage } from "@/lib/pagination";

/**
 * Organisers only: who answered "Gelmiyorum" (the `event_decliners` RPC returns nobody else), with the "Ön alım"
 * badge. `unanswered` (members who haven't answered yet; null once the event started or when cancelled) is the line
 * under the heading. Pages in the browser like `EventRoster`.
 */
export function EventDecliners({
  rows,
  overCeiling,
  unanswered,
}: {
  rows: DeclinerRow[];
  overCeiling: boolean;
  unanswered: number | null;
}) {
  const t = useTranslations("Events");
  const id = useId();
  const [page, setPage] = useState(1);
  const view = slicePage(rows, page);
  const listTop = useRef<HTMLElement>(null);

  function onPage(next: number) {
    if (next === view.page) return;
    setPage(next);
    scrollToListTop(listTop.current);
  }

  return (
    <section
      ref={listTop}
      aria-labelledby={`${id}-heading`}
      data-skeleton-result="event-decliners"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id={`${id}-heading`} className="text-lg font-semibold">
            {t("decliners.heading")}
          </h2>
          <p className="text-sm text-muted-foreground tabular-nums">{t("decliners.total", { count: rows.length })}</p>
        </div>
        {unanswered !== null && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {t("decliners.unanswered", { count: unanswered })}
          </p>
        )}
      </div>

      {overCeiling && <CeilingNotice>{t("decliners.ceiling")}</CeilingNotice>}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("decliners.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.items.map((row) => (
            <li key={row.profileId} className="flex items-center gap-3 rounded-xl border p-3">
              <Avatar className="size-10">
                {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" referrerPolicy="no-referrer" />}
                <AvatarFallback>{initials(row.fullName ?? "")}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <p className="truncate font-medium">{row.fullName ?? "—"}</p>
                {row.probation && <Badge variant="secondary">{t("roster.probation")}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {view.pageCount > 1 && (
        <PagerButtons
          page={view.page}
          pageCount={view.pageCount}
          rangeLabel={t("decliners.range", { from: view.from, to: view.to, total: view.total })}
          onPage={onPage}
        />
      )}
    </section>
  );
}
