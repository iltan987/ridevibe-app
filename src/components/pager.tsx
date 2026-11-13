import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { pagerClasses } from "@/components/pager-classes";
import { Link } from "@/i18n/navigation";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

/** Numbered pager rendered as links (server-side lists); `PagerButtons` is the client flavour. */
export async function PagerLinks({
  page,
  pageCount,
  rangeLabel,
  href,
}: {
  page: number;
  pageCount: number;
  rangeLabel: string;
  href: (page: number) => { pathname: "/admin/applications"; query: Record<string, string> };
}) {
  const t = await getTranslations("Pagination");
  const arrow = (target: number, enabled: boolean, label: string, icon: React.ReactNode) =>
    enabled ? (
      <Link href={href(target)} aria-label={label} className={pagerClasses.arrow}>
        {icon}
      </Link>
    ) : (
      <span aria-disabled="true" aria-label={label} className={cn(pagerClasses.arrow, pagerClasses.disabled)}>
        {icon}
      </span>
    );

  return (
    <nav aria-label={t("label")} data-skeleton-result="pager" className={pagerClasses.wrapper}>
      {pageCount > 1 && (
        <div className={pagerClasses.row}>
          {arrow(page - 1, page > 1, t("previous"), <ChevronLeft aria-hidden />)}
          {pageItems(page, pageCount).map((item, i) =>
            item === "gap" ? (
              <span key={`gap-${i}`} aria-hidden className={pagerClasses.gap}>
                …
              </span>
            ) : (
              <Link
                key={item}
                href={href(item)}
                aria-label={t("page", { page: item })}
                aria-current={item === page ? "page" : undefined}
                className={cn(pagerClasses.number, item === page && pagerClasses.current)}
              >
                {item}
              </Link>
            ),
          )}
          {arrow(page + 1, page < pageCount, t("next"), <ChevronRight aria-hidden />)}
        </div>
      )}
      <p className={pagerClasses.range}>{rangeLabel}</p>
    </nav>
  );
}
