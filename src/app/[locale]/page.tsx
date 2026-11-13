import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { HeroApplyForUser } from "@/components/apply/hero-apply";
import { HeroApplyGuess } from "@/components/apply/hero-apply-guess";
import { ClubBadge } from "@/components/brand/club-badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { clubJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(
  _props: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("Metadata")]);
  const images = (await parent).openGraph?.images;
  return pageMetadata({
    locale,
    path: "/",
    title: t("homeTitle"),
    description: t("description"),
    absoluteTitle: true,
    images,
  });
}

export default function HomePage() {
  const t = useTranslations("Home");
  const description = useTranslations("Metadata")("description");

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
        {/* One boundary: the fallback guesses from the session cookie; the result keeps the ad's UTM params. */}
        <Suspense
          fallback={<HeroApplyGuess className={buttonVariants({ size: "lg" })}>{t("apply")}</HeroApplyGuess>}
        >
          <HeroApplyForUser className={buttonVariants({ size: "lg" })}>{t("apply")}</HeroApplyForUser>
        </Suspense>
        <Link
          href="/events"
          className={buttonVariants({ size: "lg", variant: "outline" })}
        >
          {t("events")}
        </Link>
      </div>
      {/* Data block, not executable code: a plain script (see docs/learnings/ui.md), not InlineScript. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(clubJsonLd(description)) }}
      />
    </section>
  );
}
