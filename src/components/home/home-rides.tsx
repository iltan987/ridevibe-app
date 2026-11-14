import { useTranslations } from "next-intl";
import ridesPhoto from "@/assets/home/rides-kiz-kulesi.jpg";
import { RoutePhoto, RouteStop } from "@/components/home/route";

const PLACES = ["place1", "place2", "place3", "place4"] as const;
const DISTRICTS = ["district1", "district2", "district3", "district4"] as const;

// Phone: heading, text, places, full-bleed photo, weekday line. md+: two columns, the photo spans both rows of the
// right one (one image, so no duplicate alt text).
export function HomeRides() {
  const t = useTranslations("Home.rides");
  const districts = DISTRICTS.map((d) => t(d)).join(", ");
  return (
    <section className="pt-13 md:pt-28">
      <RouteStop className="md:grid md:grid-cols-2 md:gap-x-16 md:[--dot-top:1.6rem]">
        <div className="md:col-start-1 md:row-start-1">
          <h2 className="mb-3 text-[40px] leading-[0.95] font-extrabold text-balance [font-stretch:70%] md:mb-4.5 md:text-[72px]">
            {t("title")}
          </h2>
          <p className="text-pretty text-muted-foreground">{t("weekend")}</p>
          <ul className="my-4.5 md:my-7">
            {PLACES.map((p) => (
              <RouteStop
                key={p}
                as="li"
                kind="place"
                className="text-[30px] leading-tight font-bold [font-stretch:75%] md:text-5xl"
              >
                {t(p)}
              </RouteStop>
            ))}
          </ul>
        </div>
        <div className="mt-5.5 md:col-start-2 md:row-span-2 md:row-start-1 md:mt-3">
          <RoutePhoto
            src={ridesPhoto}
            alt={t("alt")}
            sizes="(min-width: 1024px) 400px, (min-width: 768px) 45vw, 100vw"
          />
        </div>
        <p className="text-pretty text-muted-foreground md:col-start-1 md:row-start-2">
          {t("weekday")} {districts}.
        </p>
      </RouteStop>
    </section>
  );
}
