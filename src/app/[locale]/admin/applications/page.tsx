import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Link, redirect } from "@/i18n/navigation";
import {
  APPLICATION_FILTERS,
  type ApplicationFilter,
  countApplicationsByStatus,
  listApplications,
} from "@/lib/applications/queries";
import { requirePermission } from "@/lib/auth/require-access";
import { ListSkeleton } from "@/components/admin/list-skeleton";
import { ChipCount, listChipClasses } from "@/components/lists/list-chip";
import { PagerLinks } from "@/components/pager";
import { listQuery, paramOff, serverPage } from "@/lib/list-url";
import { PAGE_SIZE, pageCount, parsePage } from "@/lib/pagination";

const DEFAULTS = { status: "new", page: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("applications"), robots: { index: false } };
}

export default function ApplicationsPage({ searchParams }: PageProps<"/[locale]/admin/applications">) {
  const t = useTranslations("Admin");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="heading text-3xl">{t("applications")}</h1>
      <Suspense fallback={<ListSkeleton rows={6} rowClassName="h-26" pager />}>
        <ApplicationsList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function ApplicationsList({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/applications">["searchParams"];
}) {
  await requirePermission("applications.view", "/admin/applications");

  const params = await searchParams;
  const status: ApplicationFilter = APPLICATION_FILTERS.find((s) => s === params.status) ?? "new";

  // The list query runs alongside the counts with the page as asked; a URL the counts correct redirects instead.
  const [rows, counts, locale, t, tApply, format] = await Promise.all([
    listApplications(status, parsePage(params.page)),
    countApplicationsByStatus(),
    getLocale(),
    getTranslations("Admin"),
    getTranslations("Apply"),
    getFormatter(),
  ]);
  const total = counts[status];
  const { page, off } = serverPage(params.page, total);
  const href = (target: { status?: ApplicationFilter; page?: number }) => ({
    pathname: "/admin/applications" as const,
    query: listQuery({ status, page, ...target }, DEFAULTS),
  });
  // Malformed, repeated, default or past-the-end values (e.g. a page emptied since) and a stale ?cursor= of the old
  // keyset pager: go to the canonical URL.
  if (off || paramOff(params.status, status, DEFAULTS.status) || paramOff(params.cursor, null)) {
    return redirect({ href: href({}), locale });
  }
  const from = (page - 1) * PAGE_SIZE;

  return (
    <>
      <nav data-skeleton-result="admin-chips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {APPLICATION_FILTERS.map((s) => (
          <Link
            key={s}
            href={href({ status: s, page: 1 })}
            aria-current={s === status ? "page" : undefined}
            className={listChipClasses.current}
          >
            {t(`statuses.${s}`)}
            <ChipCount count={counts[s]} />
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((a) => (
            <li key={a.id} data-skeleton-result="admin-row">
              <Link href={`/admin/applications/${a.id}`} className="block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                <Card className="transition-colors hover:bg-muted/40">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <span className="font-semibold">{a.full_name}</span>
                      <time dateTime={a.created_at} className="shrink-0 text-xs text-muted-foreground">
                        {format.dateTime(new Date(a.created_at), { dateStyle: "medium" })}
                      </time>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <Badge variant="secondary">
                        {a.district}
                        {a.side ? ` · ${t(`sides.${a.side}`)}` : ` · ${a.city}`}
                      </Badge>
                      <Badge variant="outline">{tApply(`options.license_class.${a.license_class}`)}</Badge>
                      <Badge variant="outline">
                        {a.owns_motorcycle ? `${a.motorcycle_brand} ${a.motorcycle_model}` : t("noBike")}
                      </Badge>
                    </div>
                    {a.retained_until && (
                      <p className="text-xs font-medium text-accent-text">
                        {t("retained", { date: format.dateTime(new Date(a.retained_until), { dateStyle: "medium" }) })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {tApply(`options.heard_from.${a.heard_from}`)}
                      {a.utm_campaign && ` · ${t("campaign", { campaign: a.utm_campaign })}`}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <PagerLinks
          page={page}
          pageCount={pageCount(total)}
          rangeLabel={t("range", { from: from + 1, to: from + rows.length, total })}
          href={(target) => href({ page: target })}
        />
      )}
    </>
  );
}
