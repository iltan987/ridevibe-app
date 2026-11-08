import { useTranslations } from "next-intl";

// Temporary placeholder for sections that are planned but not built yet.
export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations("ComingSoon");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-2 px-4 py-16">
      <h1 className="heading text-3xl">{title}</h1>
      <p className="text-muted-foreground">
        {t("title")} — {t("description")}
      </p>
    </section>
  );
}
