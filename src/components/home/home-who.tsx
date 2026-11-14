import { useTranslations } from "next-intl";
import whoPhoto from "@/assets/home/who-terrace.jpg";
import { RoutePhoto, RouteStop } from "@/components/home/route";

const TICKS = ["50cc", "125", "250", "400", "700", "1000cc"] as const;

// Phone: heading, text, ruler, conditions, full-bleed photo. md+: photo left, text right (stop on the row wrapper,
// dot at the heading's height).
export function HomeWho() {
  const t = useTranslations("Home.who");
  return (
    <section className="pt-13 md:pt-28">
      <RouteStop className="md:grid md:grid-cols-2 md:items-start md:gap-x-16 md:[--dot-top:1.6rem]">
        <div className="md:col-start-2 md:row-start-1">
          <h2 className="mb-3 text-[40px] leading-[0.95] font-extrabold text-balance font-stretch-70% md:mb-4.5 md:text-[72px]">
            {t("title")}
          </h2>
          <p className="text-pretty text-muted-foreground">{t("body")}</p>
          <div role="img" aria-label={t("rulerLabel")} className="mt-5 md:mt-7">
            <div className="relative mx-1.5 my-4.5 h-[3px] bg-foreground">
              {[0, 20, 40, 60, 80, 100].map((p) => (
                <span
                  key={p}
                  className="absolute -top-1.5 h-[15px] w-0.5 bg-foreground"
                  style={{ left: p === 100 ? "calc(100% - 2px)" : `${p}%` }}
                />
              ))}
            </div>
            <div
              aria-hidden
              className="flex justify-between text-[13px] text-muted-foreground font-stretch-85% md:text-base"
            >
              {TICKS.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
          <p className="mt-2.5 text-sm text-pretty text-muted-foreground md:mt-3.5 md:text-base">{t("conditions")}</p>
        </div>
        <div className="mt-5.5 md:col-start-1 md:row-start-1 md:mt-3">
          <RoutePhoto
            src={whoPhoto}
            alt={t("alt")}
            sizes="(min-width: 1024px) 400px, (min-width: 768px) 45vw, 100vw"
            className="object-[50%_70%]"
          />
        </div>
      </RouteStop>
    </section>
  );
}
