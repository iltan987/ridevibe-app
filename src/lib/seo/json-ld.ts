import { INSTAGRAM_URL, LOGO_URL, SITE_ALTERNATE_NAME, SITE_NAME, SITE_URL } from "./site.ts";

const WEBSITE_ID = `${SITE_URL}/#website`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/** schema.org graph for the home page: the website and the club behind it. */
export function clubJsonLd(description: string): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAME,
        url: `${SITE_URL}/`,
        publisher: { "@id": ORGANIZATION_ID },
      },
      {
        "@type": "SportsOrganization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        alternateName: SITE_ALTERNATE_NAME,
        url: `${SITE_URL}/`,
        logo: LOGO_URL,
        sameAs: [INSTAGRAM_URL],
        description,
        sport: "Motorcycling",
        areaServed: { "@type": "City", name: "Istanbul" },
      },
    ],
  };
}

/** JSON for an inline `<script type="application/ld+json">`: `<` is escaped so no value can close the tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
