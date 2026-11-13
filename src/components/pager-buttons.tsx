"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { pagerClasses } from "@/components/pager-classes";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Numbered pager for client-side lists: same markup as `PagerLinks`, with buttons instead of links. */
export function PagerButtons({
  page,
  pageCount,
  rangeLabel,
  onPage,
}: {
  page: number;
  pageCount: number;
  rangeLabel: string;
  onPage: (page: number) => void;
}) {
  const t = useTranslations("Pagination");
  return (
    <nav aria-label={t("label")} data-skeleton-result="pager" className={pagerClasses.wrapper}>
      {pageCount > 1 && (
        <div className={pagerClasses.row}>
          {page > 1 ? (
            <button type="button" aria-label={t("previous")} className={pagerClasses.arrow} onClick={() => onPage(page - 1)}>
              <ChevronLeft aria-hidden />
            </button>
          ) : (
            <span aria-disabled="true" aria-label={t("previous")} className={cn(pagerClasses.arrow, pagerClasses.disabled)}>
              <ChevronLeft aria-hidden />
            </span>
          )}
          {pageItems(page, pageCount).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className={pagerClasses.gap}>
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={t("page", { page: item })}
                aria-current={item === page ? "page" : undefined}
                className={cn(pagerClasses.number, item === page && pagerClasses.current)}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            ),
          )}
          {page < pageCount ? (
            <button type="button" aria-label={t("next")} className={pagerClasses.arrow} onClick={() => onPage(page + 1)}>
              <ChevronRight aria-hidden />
            </button>
          ) : (
            <span aria-disabled="true" aria-label={t("next")} className={cn(pagerClasses.arrow, pagerClasses.disabled)}>
              <ChevronRight aria-hidden />
            </span>
          )}
        </div>
      )}
      <p className={pagerClasses.range}>{rangeLabel}</p>
    </nav>
  );
}
