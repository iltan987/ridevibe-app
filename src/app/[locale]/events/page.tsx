import { Plus } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ComingSoon } from "@/components/coming-soon";
import { EventsList } from "@/components/events/events-list";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { canSeeEvents } from "@/lib/events/access";
import { getEventCounts, getMySignups, listUpcomingEvents } from "@/lib/events/queries";
import { LIST_CEILING } from "@/lib/pagination";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [locale, t, tm] = await Promise.all([getLocale(), getTranslations("Nav"), getTranslations("Metadata")]);
  const images = (await parent).openGraph?.images;
  return pageMetadata({
    locale,
    path: "/events",
    title: t("events"),
    description: tm("description"),
    index: false,
    images,
  });
}

// Release gate (spec §9): `canSeeEvents` asks the database gate (until the release: organisers only); everyone else
// keeps the "coming soon" page, which is also the fallback while the session is read. Creating stays organiser-only.
export default function EventsPage() {
  const t = useTranslations("Nav");
  return (
    <Suspense fallback={<ComingSoon title={t("events")} />}>
      <Events />
    </Suspense>
  );
}

async function Events() {
  const [user, tNav] = await Promise.all([getCurrentUser(), getTranslations("Nav")]);
  if (!(await canSeeEvents())) return <ComingSoon title={tNav("events")} />;

  const [{ events, overCeiling }, mySignups, t] = await Promise.all([
    listUpcomingEvents(),
    getMySignups(),
    getTranslations("Events"),
  ]);
  if (overCeiling) console.error("upcoming events over ceiling", { count: `${LIST_CEILING}+` });
  const counts = await getEventCounts(events.map((event) => event.id));

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <div data-skeleton-result="events-heading" className="flex min-h-8 items-center justify-between gap-3">
        <h1 className="heading text-3xl">{t("title")}</h1>
        {can(user?.access, "events.manage") && (
          <Link href="/events/new" className={buttonVariants()}>
            <Plus data-icon="inline-start" aria-hidden />
            {t("create")}
          </Link>
        )}
      </div>
      <EventsList
        events={events}
        counts={Object.fromEntries(counts)}
        joined={[...mySignups.keys()]}
        overCeiling={overCeiling}
      />
    </section>
  );
}
