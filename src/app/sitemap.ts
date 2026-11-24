import type { Locale } from "next-intl";
import type { MetadataRoute } from "next";
import { localizedUrl, type PagePath } from "../lib/seo/site.ts"; // relative + extension: `node --test` can't resolve `@/`

const LOCALES: Locale[] = ["tr", "en"];
const PUBLIC_PATHS: PagePath[] = ["/", "/apply", "/events"];

export default function sitemap(): MetadataRoute.Sitemap {
  return LOCALES.flatMap((locale) => PUBLIC_PATHS.map((path) => ({ url: localizedUrl(locale, path) })));
}
