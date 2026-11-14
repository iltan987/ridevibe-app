import { useTranslations } from "next-intl";

const QUESTIONS = [1, 2, 3] as const;

// The last block inside the route: the line ends at its bottom edge.
export function HomeFaq() {
  const t = useTranslations("Home.faq");
  return (
    <section className="pt-13 pb-14 md:pt-28 md:pb-24">
      <div className="max-w-190">
        <h2 className="text-[32px] leading-[0.95] font-extrabold text-balance [font-stretch:70%] md:text-[52px]">
          {t("title")}
        </h2>
        <dl>
          {QUESTIONS.map((n) => (
            <div key={n} className="mt-4.5 md:mt-6.5">
              <dt className="text-lg font-bold md:text-[22px]">{t(`q${n}`)}</dt>
              <dd className="mt-1 text-muted-foreground">{t(`a${n}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
