import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { HomeClosing } from "@/components/home/home-closing";
import { HomeFaq } from "@/components/home/home-faq";
import { HomeHero } from "@/components/home/home-hero";
import { HomeJoin } from "@/components/home/home-join";
import { HomeNextRides } from "@/components/home/home-next-rides";
import { HomeRides } from "@/components/home/home-rides";
import { HomeWho } from "@/components/home/home-who";
import { LicensePlate } from "@/components/home/license-plate";
import { Route } from "@/components/home/route";
import { clubJsonLd, serializeJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
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
      <LicensePlate />
      <Route>
        <HomeRides />
        <HomeNextRides />
        <HomeWho />
        <HomeJoin />
        <HomeFaq />
      </Route>
      <HomeClosing />
      {/* Data block, not executable code: a plain script (see docs/learnings/ui.md), not InlineScript. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(clubJsonLd(description)) }}
      />
    </>
  );
}
