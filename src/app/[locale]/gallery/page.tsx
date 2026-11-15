import type { Metadata, ResolvingMetadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/coming-soon";
import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const [locale, t, tm] = await Promise.all([getLocale(), getTranslations("Nav"), getTranslations("Metadata")]);
  const images = (await parent).openGraph?.images;
  return pageMetadata({
    locale,
    path: "/gallery",
    title: t("gallery"),
    description: tm("description"),
    index: false,
    images,
  });
}

export default function GalleryPage() {
  const t = useTranslations("Nav");
  return <ComingSoon title={t("gallery")} />;
}
