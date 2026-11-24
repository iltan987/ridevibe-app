import { getLocale, getTranslations } from "next-intl/server";
import { TeaserCard } from "@/components/events/teaser-card";
import { HomeApplyButton } from "@/components/home/home-apply-button";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { buttonVariants } from "@/components/ui/button";
import { getPathname, Link } from "@/i18n/navigation";
import { getTeaserRides } from "@/lib/events/public";

/**
 * `/events` for everyone outside the events gate (events release spec §5.3; indexable): heading, intro (the weekly
 * rides, who rides with us, apply), the total, every upcoming scheduled ride as a `TeaserCard` (no links: no time,
 * place or id leaves the database), or an empty state; then "Kulübe Başvur" when `/apply` would show the form
 * (`HomeApplyButton`) and, signed out, "Giriş yap" (back to `/events`). No pages: a handful of weekly rides, read up
 * to `max_rows` with the total from the database, failing loudly beyond it. Skeleton: `EventsTeaserSkeleton`.
 */
export async function EventsTeaser({ signedIn }: { signedIn: boolean }) {
  const [{ rides, total }, locale, t, tEvents] = await Promise.all([
    getTeaserRides(),
    getLocale(),
    getTranslations("Events.teaser"),
    getTranslations("Events"),
  ]);
  const next = getPathname({ href: "/events", locale });

  return (
    <div data-skeleton-result="events-teaser" className="flex flex-col gap-6">
      <div data-skeleton-result="events-teaser-intro" className="flex flex-col gap-3">
        <h1 className="heading text-3xl">{tEvents("title")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </div>

      {rides.length === 0 ? (
        <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <>
          <p
            data-skeleton-result="events-teaser-total"
            className="flex min-h-5 items-center text-sm text-muted-foreground"
          >
            {t("total", { count: total })}
          </p>
          {total > rides.length && <CeilingNotice>{t("ceiling", { total, shown: rides.length })}</CeilingNotice>}
          <ul className="flex flex-col gap-3">
            {rides.map((ride, i) => (
              // No id in the public list: the position is the key (the list never reorders on the client).
              <li key={i} data-skeleton-result={i === 0 ? "events-teaser-row" : undefined}>
                <TeaserCard title={ride.title} day={ride.day} kind="ride" area={ride.area} side={ride.side} />
              </li>
            ))}
          </ul>
        </>
      )}

      {/* `empty:hidden`: a signed-in applicant under review gets no button, so no empty row (and gap) either. */}
      <div data-skeleton-result="events-teaser-actions" className="flex flex-wrap gap-2 empty:hidden">
        <HomeApplyButton />
        {!signedIn && (
          <Link
            href={{ pathname: "/sign-in", query: { next } }}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {t("signIn")}
          </Link>
        )}
      </div>
    </div>
  );
}
