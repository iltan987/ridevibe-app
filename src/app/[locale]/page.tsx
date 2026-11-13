import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { HomeHero } from "@/components/home/home-hero";
import { HomeStats } from "@/components/home/home-stats";
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
  const description = useTranslations("Metadata")("description");

  return (
    <>
      <HomeHero />
      <HomeStats />
      {/* Data block, not executable code: a plain script (see docs/learnings/ui.md), not InlineScript. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(clubJsonLd(description)) }}
      />
    </>
  );
}
