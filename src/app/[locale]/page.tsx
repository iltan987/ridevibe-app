import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { ApplyLink } from "@/components/apply/apply-link";
import { ClubBadge } from "@/components/brand/club-badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function HomePage() {
  const t = useTranslations("Home");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="relative w-fit">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 scale-150 rounded-full bg-primary/35 blur-3xl"
        />
        <ClubBadge preload sizes="118px" className="w-[118px]" />
      </div>
      <p className="eyebrow">{t("eyebrow")}</p>
      <h1 className="heading text-5xl leading-[1.05] text-balance sm:text-7xl">
        {t("title")}
      </h1>
      <p className="max-w-xl text-lg text-pretty text-muted-foreground">
        {t("subtitle")}
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* Keeps the ad's UTM params; the fallback is the same link without them. */}
        <Suspense
          fallback={
            <Link href="/apply" className={buttonVariants({ size: "lg" })}>
              {t("apply")}
            </Link>
          }
        >
          <ApplyLink className={buttonVariants({ size: "lg" })}>{t("apply")}</ApplyLink>
        </Suspense>
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
