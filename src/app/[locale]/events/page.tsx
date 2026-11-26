import { Plus } from "lucide-react";
import type { Metadata, ResolvingMetadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SessionHintSwitch } from "@/components/auth/session-hint-switch";
import { EventsList } from "@/components/events/events-list";
import { EventsSkeleton } from "@/components/events/events-skeleton";
import { EventsTeaser } from "@/components/events/events-teaser";
import { EventsTeaserSkeleton } from "@/components/events/events-teaser-skeleton";
import { InstallBanner } from "@/components/pwa/install-banner";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/user";
import { canSeeEvents } from "@/lib/events/access";
import { getEventCounts, getMyDeclines, getMySignups, listUpcomingEvents } from "@/lib/events/queries";
import { LIST_CEILING } from "@/lib/pagination";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [locale, t, tm] = await Promise.all([getLocale(), getTranslations("Nav"), getTranslations("Metadata")]);
  const images = (await parent).openGraph?.images;
  return pageMetadata({
    locale,
    path: "/events",
    title: t("events"),
    description: tm("eventsDescription"),
    images,
  });
}

// Club members (`canSeeEvents`: active and ön alım) get the list with its filters; everyone else the public teaser of
// the upcoming rides (events release spec §5.3), which makes the page indexable. The fallback is the skeleton of what
// the visitor most likely gets, guessed from the session cookie: signed-in non-members see the members' skeleton
// first (docs/follow-ups.md). Creating stays organiser-only.
export default function EventsPage() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <Suspense fallback={<SessionHintSwitch signedIn={<EventsSkeleton />} signedOut={<EventsTeaserSkeleton />} />}>
        <Events />
      </Suspense>
    </section>
  );
}

async function Events() {
  const user = await getCurrentUser();
  if (!(await canSeeEvents())) return <EventsTeaser signedIn={user !== null} />;

  const [{ events, overCeiling }, mySignups, myDeclines, t] = await Promise.all([
    listUpcomingEvents(),
    getMySignups(),
    getMyDeclines(),
    getTranslations("Events"),
  ]);
  if (overCeiling) console.error("upcoming events over ceiling", { count: `${LIST_CEILING}+` });
  const counts = await getEventCounts(events.map((event) => event.id));
  const canCreate = can(user?.access, "events.manage");

  return (
    <>
      <div data-skeleton-result="events-heading" className="flex min-h-8 items-center justify-between gap-3">
        <h1 className="heading text-3xl">{t("title")}</h1>
        {canCreate && (
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
        declined={[...myDeclines]}
        overCeiling={overCeiling}
        canCreate={canCreate}
      />
      <InstallBanner />
    </>
  );
}
