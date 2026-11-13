import { useTranslations } from "next-intl";

const STEPS = [1, 2, 3, 4] as const;

export function HomeJoin() {
  const t = useTranslations("Home");
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-7 md:pt-18">
      <div className="flex flex-col gap-4">
        <p className="eyebrow">{t("join.eyebrow")}</p>
        <h2 className="heading text-3xl text-balance md:text-4xl">{t("join.title")}</h2>
      </div>
      <div className="mt-5 flex flex-col gap-6 md:flex-row md:items-start md:gap-12">
        <ol className="flex flex-col gap-4 md:w-1/2">
          {STEPS.map((n) => (
            <li key={n} className="flex items-start gap-4">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
              >
                {n}
              </span>
              <div>
                <h3 className="font-bold">{t(`join.step${n}Title`)}</h3>
                <p className="text-muted-foreground">{t(`join.step${n}Body`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className="rounded-xl border bg-card p-5 md:w-1/2">
          <h3 className="eyebrow">{t("rules.title")}</h3>
          <p className="mt-3 text-pretty text-foreground/90">{t("rules.body")}</p>
          <p className="mt-3 font-bold text-pretty">{t("rules.motto")}</p>
        </div>
      </div>
    </section>
  );
}
