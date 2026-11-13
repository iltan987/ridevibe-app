import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { localizedUrl, ogLocale, SITE_NAME, type PagePath } from "./site.ts";

type OgImages = NonNullable<Metadata["openGraph"]>["images"];

export function sharedOpenGraph(locale: Locale) {
  return {
    type: "website" as const,
    siteName: SITE_NAME,
    locale: ogLocale(locale),
    alternateLocale: [ogLocale(locale === "tr" ? "en" : "tr")],
  };
}

/**
 * Per-page metadata: canonical URL, Open Graph (a page's `openGraph` replaces the layout's, so it
 * repeats the shared fields) and an optional noindex.
 */
export function pageMetadata(opts: {
  locale: Locale;
  path: PagePath;
  title: string;
  description: string;
  absoluteTitle?: boolean;
  index?: boolean;
  /** Parent segment images (`(await parent).openGraph?.images`): a page `openGraph` would otherwise drop the file-based image. */
  images?: OgImages;
}): Metadata {
  const canonical = localizedUrl(opts.locale, opts.path);
  return {
    title: opts.absoluteTitle ? { absolute: opts.title } : opts.title,
    description: opts.description,
    alternates: { canonical },
    openGraph: {
      ...sharedOpenGraph(opts.locale),
      url: canonical,
      title: opts.title,
      description: opts.description,
      ...(opts.images ? { images: opts.images } : {}),
    },
    ...(opts.index === false ? { robots: { index: false } } : {}),
  };
}
