"use client";

import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { scrollToListTop } from "@/components/lists/use-list-search";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { SafetyCardDialog } from "@/components/members/safety-card-dialog";
import { PagerButtons } from "@/components/pager-buttons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { RosterRow } from "@/lib/events/queries";
import { initials } from "@/lib/initials";
import { slicePage } from "@/lib/pagination";

/**
 * Who joined, as the viewer may see it (the `event_roster` RPC already decided the rows): name, Sürücü/Artçı and
 * "+N misafir" for everyone; organisers also get the "Ön alım" badge and "Acil durum kişisi yok", and `safety`
 * holders a safety card per row. Active members don't see ön alım participants: `newMembers` adds them as a count
 * beside the total ("12 üye · +2 yeni üye", on every page).
 * The total sits by the heading; more than PAGE_SIZE rows page in the browser (the page lives in component state,
 * not the URL: a section of the event page, not a list page).
 */
export function EventRoster({
  rows,
  overCeiling,
  organiser,
  safety,
  newMembers,
}: {
  rows: RosterRow[];
  overCeiling: boolean;
  organiser: boolean;
  safety: boolean;
  newMembers: number;
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
      data-skeleton-result="event-roster"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-lg font-semibold">
          {t("roster.heading")}
        </h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          {newMembers > 0
            ? t("roster.totalWithNew", { count: rows.length, newMembers })
            : t("roster.total", { count: rows.length })}
        </p>
      </div>

      {overCeiling && <CeilingNotice>{t("roster.ceiling")}</CeilingNotice>}

      {rows.length === 0 ? (
        newMembers === 0 && <p className="text-sm text-muted-foreground">{t("roster.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {view.items.map((row) => {
            const name = row.fullName ?? "—";
            return (
              <li key={row.profileId} className="flex items-center gap-3 rounded-xl border p-3">
                <Avatar className="size-10">
                  {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" referrerPolicy="no-referrer" />}
                  <AvatarFallback>{initials(row.fullName ?? "")}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{name}</p>
                    {organiser && row.probation && <Badge variant="secondary">{t("roster.probation")}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(`join.roles.${row.role}`)}
                    {row.guests > 0 && ` · ${t("roster.guests", { count: row.guests })}`}
                  </p>
                  {/* hasEmergencyContact is null for everyone but organisers. */}
                  {(safety || row.hasEmergencyContact === false) && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {safety && <SafetyCardDialog memberId={row.profileId} memberName={name} />}
                      {row.hasEmergencyContact === false && (
                        <Badge variant="destructive">{t("roster.noContact")}</Badge>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view.pageCount > 1 && (
        <PagerButtons
          page={view.page}
          pageCount={view.pageCount}
          rangeLabel={t("roster.range", { from: view.from, to: view.to, total: view.total })}
          onPage={onPage}
        />
      )}
    </section>
  );
}
