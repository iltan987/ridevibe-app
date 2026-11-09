import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
  countApplicationsByStatus,
  listApplications,
} from "@/lib/applications/queries";
import { requirePermission } from "@/lib/auth/require-access";
import { Pager } from "@/components/admin/pager";
import { decodeCursor } from "@/lib/pagination";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return { title: t("applications"), robots: { index: false } };
}

export default function ApplicationsPage({ searchParams }: PageProps<"/[locale]/admin/applications">) {
  const t = useTranslations("Admin");

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <h1 className="heading text-3xl">{t("applications")}</h1>
      <Suspense fallback={<ListSkeleton />}>
        <ApplicationsList searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}

async function ApplicationsList({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/applications">["searchParams"];
}) {
  await requirePermission("applications.view", "/admin/applications");

  const params = await searchParams;
  const status: ApplicationStatus = APPLICATION_STATUSES.includes(params.status as ApplicationStatus)
    ? (params.status as ApplicationStatus)
    : "new";
  const cursor = decodeCursor(params.cursor);

  const [page, counts, t, tApply, format] = await Promise.all([
    listApplications(status, cursor),
    countApplicationsByStatus(),
    getTranslations("Admin"),
    getTranslations("Apply"),
    getFormatter(),
  ]);

  return (
    <>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {APPLICATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={{ pathname: "/admin/applications", query: { status: s } }}
            aria-current={s === status ? "page" : undefined}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-input px-3.5 py-1.5 text-sm font-medium text-muted-foreground aria-[current=page]:border-primary aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground"
          >
            {t(`statuses.${s}`)}
            <span className="tabular-nums opacity-70">{counts[s]}</span>
          </Link>
        ))}
      </nav>

      {page.items.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {page.items.map((a) => (
            <li key={a.id}>
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

      <Pager pathname="/admin/applications" query={{ status }} nextCursor={page.nextCursor} onFirstPage={!cursor} />
    </>
  );
}
