import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TeaserCard } from "@/components/events/teaser-card";
import { RouteStop } from "@/components/home/route";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getHomeRides } from "@/lib/events/public";
import { cn } from "@/lib/utils";

const SHOWN = 3;

/**
 * The home page's next rides (events release spec §5.5): the first 3 upcoming scheduled rides as `TeaserCard`s (public
 * data only, no links) and "Tüm etkinlikler" to `/events`, which lists them all (with the total when there are more).
 * Nothing when no ride is planned or the read failed. No session read: the cached list is prerendered into the home
 * page's shell, and organiser writes expire it (`updateTag`).
 */
export async function HomeNextRides() {
  const [result, t] = await Promise.all([getHomeRides(), getTranslations("Home.nextRides")]);
  // No ride planned, or the read failed (`getHomeRides`: left out rather than an error page).
  if (!result || result.rides.length === 0) return null;
  const { rides, total } = result;

  return (
    <section data-home-next-rides className="pt-13 md:pt-28">
      <RouteStop className="md:[--dot-top:1.6rem]">
        <h2 className="mb-3 text-[40px] leading-[0.95] font-extrabold text-balance font-stretch-70% md:mb-4.5 md:text-[72px]">
          {t("title")}
        </h2>
        <p className="text-pretty text-muted-foreground">{t("body")}</p>
        <ul className="mt-5 grid gap-3 md:mt-7 md:grid-cols-3">
          {rides.slice(0, SHOWN).map((ride, i) => (
            // No id in the public list: the position is the key. `grid`: the card fills the row's height.
            <li key={i} className="grid">
              <TeaserCard
                title={ride.title}
                day={ride.day}
                kind="ride"
                area={ride.area}
                side={ride.side}
                headingLevel="h3"
              />
            </li>
          ))}
        </ul>
        <Link href="/events" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "mt-5 md:mt-7")}>
          {total > SHOWN ? t("allWithTotal", { count: total }) : t("all")}
          <ArrowRight aria-hidden />
        </Link>
      </RouteStop>
    </section>
  );
}
