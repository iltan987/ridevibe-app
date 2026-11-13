import { useTranslations } from "next-intl";

const STATS = ["members", "rides", "sides"] as const;

export function HomeStats() {
  const t = useTranslations("Home.stats");
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="grid grid-cols-3 gap-3">
        {STATS.map((stat) => (
          <div key={stat} className="rounded-xl border bg-card px-3 py-4 text-center">
            <p className="heading text-xl text-accent-text sm:text-3xl">{t(`${stat}Value`)}</p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{t(`${stat}Label`)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
