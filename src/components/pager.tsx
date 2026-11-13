import { ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { pagerClasses } from "@/components/pager-classes";
import { Link } from "@/i18n/navigation";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export { pagerClasses };

type Query = Record<string, string | undefined>;

/** "Next page" / "First page" links for keyset-paginated lists (see lib/pagination). */
export async function Pager({
  pathname,
  query,
  nextCursor,
  onFirstPage,
}: {
  pathname: "/admin/members" | "/admin/applications" | "/members";
  query: Query;
  nextCursor: string | null;
  onFirstPage: boolean;
}) {
  if (!nextCursor && onFirstPage) return null;
  const t = await getTranslations("Pagination");
  const clean = (q: Query) => Object.fromEntries(Object.entries(q).filter(([, v]) => v)) as Record<string, string>;

  return (
    <nav className="flex items-center justify-between gap-3">
      {onFirstPage ? (
        <span />
      ) : (
        <Link href={{ pathname, query: clean(query) }} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          {t("first")}
        </Link>
      )}
      {nextCursor && (
        <Link
          href={{ pathname, query: clean({ ...query, cursor: nextCursor }) }}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {t("next")} <ChevronRight aria-hidden />
        </Link>
      )}
    </nav>
  );
}

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
