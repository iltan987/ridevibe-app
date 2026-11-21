import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { EventCard } from "@/components/events/event-card";
import { EventsSkeleton } from "@/components/events/events-skeleton";
import { PagerLinks } from "@/components/pager";
import { Link, redirect } from "@/i18n/navigation";
import { requireEventsAccess } from "@/lib/events/access";
import { NO_COUNTS } from "@/lib/events/join";
import { getEventCounts, listPastEvents } from "@/lib/events/queries";
import { listQuery, serverPage } from "@/lib/list-url";
import { PAGE_SIZE, pageCount, parsePage } from "@/lib/pagination";

const DEFAULTS = { page: 1 };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Events");
  return { title: t("pastTitle"), robots: { index: false } };
}

// Past events grow without bound: paged on the server (`?page=N`) like /admin/applications. Organisers only during
// the release gate (spec §9); the heading sits inside the boundary so nobody else learns the page exists.
export default function PastEventsPage({ searchParams }: PageProps<"/[locale]/events/past">) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<EventsSkeleton chips={false} />}>
        <PastEvents searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

async function PastEvents({ searchParams }: { searchParams: PageProps<"/[locale]/events/past">["searchParams"] }) {
  await requireEventsAccess("/events/past");

  const params = await searchParams;
  // The list query runs with the page as asked; a URL the total corrects redirects instead.
  const [{ events, total }, locale, t] = await Promise.all([
    listPastEvents(parsePage(params.page)),
    getLocale(),
    getTranslations("Events"),
  ]);
  const { page, off } = serverPage(params.page, total);
  const href = (target: number) => ({
    pathname: "/events/past" as const,
    query: listQuery({ page: target }, DEFAULTS),
  });
  // Malformed, repeated, `1` spelled out or past the end (e.g. a page emptied since): go to the canonical URL.
  if (off) return redirect({ href: href(page), locale });
  const from = (page - 1) * PAGE_SIZE;
  const counts = await getEventCounts(events.map((event) => event.id));

  return (
    <>
      <div data-skeleton-result="events-heading" className="flex min-h-8 items-center justify-between gap-3">
        <h1 className="heading text-3xl">{t("pastTitle")}</h1>
      </div>
      <div data-skeleton-result="events-total" className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("pastTotal", { count: total })}</p>
        <Link href="/events" className="font-medium text-accent-text hover:underline">
          {t("upcomingLink")}
        </Link>
      </div>

      {events.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("pastEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} counts={counts.get(event.id) ?? NO_COUNTS} withYear />
            </li>
          ))}
        </ul>
      )}

      {events.length > 0 && (
        <PagerLinks
          page={page}
          pageCount={pageCount(total)}
          rangeLabel={t("range", { from: from + 1, to: from + events.length, total })}
          href={href}
        />
      )}
    </>
  );
}
