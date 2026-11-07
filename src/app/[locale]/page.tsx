import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
        {t("eyebrow")}
      </p>
      <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
        {t("title")}
      </h1>
      <p className="max-w-xl text-lg text-pretty text-muted-foreground">
        {t("subtitle")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link href="/apply" className={buttonVariants({ size: "lg" })}>
          {t("apply")}
        </Link>
        <Link
          href="/events"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          {t("events")}
        </Link>
      </div>
    </section>
  );
}
