import { useTranslations } from "next-intl";
import { RouteStop } from "@/components/home/route";

const STEPS = [1, 2, 3, 4] as const;

// The steps are stops on the line, the last ("Ana grup") the larger orange one. Rules follow on phones and sit
// beside the steps on md+.
export function HomeJoin() {
  const t = useTranslations("Home");
  return (
    <section className="pt-13 md:grid md:grid-cols-2 md:gap-x-16 md:pt-28">
      <div>
        <h2 className="mb-5 text-[40px] leading-[0.95] font-extrabold text-balance [font-stretch:70%] md:mb-7 md:text-[72px]">
          {t("join.title")}
        </h2>
        <ol>
          {STEPS.map((n) => (
            <RouteStop
              key={n}
              as="li"
              kind={n === STEPS.length ? "last" : "step"}
              className="pb-4.5 [--dot-top:0.35rem] md:pb-6.5 md:[--dot-top:0.6rem]"
            >
              <h3 className="text-[22px] leading-tight font-bold [font-stretch:80%] md:text-3xl">
                {t(`join.step${n}Title`)}
              </h3>
              <p className="text-muted-foreground">{t(`join.step${n}Body`)}</p>
            </RouteStop>
          ))}
        </ol>
      </div>
      <div className="mt-8 md:mt-0 md:pt-24">
        <h2 className="mb-3.5 text-[44px] leading-[0.95] font-extrabold text-balance text-accent-text [font-stretch:70%] md:mb-5 md:text-[76px]">
          {t("rules.motto")}
        </h2>
        <p className="text-pretty text-muted-foreground">{t("rules.body")}</p>
      </div>
    </section>
  );
}
