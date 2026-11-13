import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo/site.ts"; // relative + extension: `node --test` can't resolve `@/`

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
