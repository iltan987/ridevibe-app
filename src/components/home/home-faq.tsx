import { useTranslations } from "next-intl";

const QUESTIONS = [1, 2, 3] as const;

export function HomeFaq() {
  const t = useTranslations("Home.faq");
  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-7 md:pt-18">
      <div className="max-w-[720px]">
        <h2 className="heading text-3xl text-balance md:text-4xl">{t("title")}</h2>
        <dl className="mt-5">
          {QUESTIONS.map((n) => (
            <div key={n} className="border-t py-4">
              <dt className="font-bold">{t(`q${n}`)}</dt>
              <dd className="mt-1 text-muted-foreground">{t(`a${n}`)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
