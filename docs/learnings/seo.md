# SEO, link previews, structured data

Spec and research basis (checked 2026-11-13): `docs/superpowers/specs/2026-11-13-seo-technical-design.md`. Check
everything here against the live Google/Meta docs when it looks off; the rules change often. Check the deployed site
with `scripts/e2e/seo-check.mjs` (`scripts/e2e/README.md`).

### Google ignores SVG favicons (2026-11-13)
- **Symptom:** the site has only `icon.svg` + `favicon.ico` + `apple-icon.png`; no favicon in search results.
- **Cause:** Google's favicon docs list BMP, GIF, ICO, PNG, JPEG, PPM, TIFF, not SVG; they want a square raster
  icon, larger than 48 px recommended (a multiple of 48), linked from the **home page**. Next emits one
  `<link rel="icon">` per icon file, so `icon.svg` and a numbered `icon1.png` coexist and both are emitted (`sizes` is
  read from the file).
- **Do:** keep `src/app/icon1.png` (192 px, a copy of `public/brand/icon-192.png`) beside `icon.svg`. The favicon
  and site name take days to weeks to show up after a deploy.
- **Source:** developers.google.com/search/docs/appearance/favicon-in-search (2026-10-27); bundled `app-icons.md`;
  found by testing.

### Share image: JPEG under 600 KB, not a 300 KB PNG (2026-11-13)
- **Symptom:** the 1200x630 PNG share image was ~317 KB; "WhatsApp wants under 300 KB" is all over the web.
- **Cause:** the official limit (Meta "Link Previews") is **600 KB** for `og:image` (and the tags within the first
  300 KB of HTML); "300 KB" is folklore. A lighter file is still kinder to crawlers.
- **Do:** convert with Next's own sharp (`require.resolve('sharp', { paths: [require.resolve('next')] })`,
  `.jpeg({ quality: 82, mozjpeg: true })`): 317 KB became 69 KB. `opengraph-image.jpg` is picked up by the file
  convention (`src/app/[locale]/opengraph-image.jpg`, served from `/-/opengraph-image.jpg`, see `ui.md`).
- **Source:** Meta business-messaging docs "Link Previews"; found by testing.

### Preview crawlers send the recipient's `Accept-Language` (2026-11-13)
- **Symptom:** a link shared on WhatsApp previews in a different language than the page's own, or from a redirect.
- **Cause:** WhatsApp's crawler sends the language of the **recipient**; Googlebot sends none. A locale redirect on
  `Accept-Language` therefore changes the preview (and, for Google, "avoid automatic language redirects").
- **Do:** no browser-language detection: `/` is always Turkish on a first visit, the explicit choice is remembered
  in `NEXT_LOCALE` for a year (`next-intl.md`, "Locale detection order"). Each language has its own canonical URL and
  `og:locale` / `og:locale:alternate`.
- **Source:** Meta "Link Previews"; Google multi-regional guide (2025-12-10).

### `/robots.txt` without a file is caught by `[locale]` (2026-11-13)
- **Symptom:** `/robots.txt` returns the 404 page with `<html lang="robots.txt">`, and Google then treats it as "no
  robots.txt" (a 4xx).
- **Cause:** the `[locale]` dynamic segment matches any one-segment path, `robots.txt` included.
- **Do:** ship `src/app/robots.ts` and `src/app/sitemap.ts` (static route handlers win over the dynamic segment); the
  seo-check script asserts both are served. Don't disallow pages that carry `noindex` (the tag is never seen).
- **Source:** spec research; route table before/after in the build output (`pnpm build`).

### Next overwrites nested metadata objects per segment (2026-11-13)
- **Symptom:** a page that sets `openGraph` loses the shared fields (`siteName`, `locale`, `type`, `images`) and the
  layout's `og:image`.
- **Cause:** Next merges metadata shallowly: a nested object like `openGraph` replaces the parent's whole object.
- **Do:** build every page's metadata through `pageMetadata` (`src/lib/seo/metadata.ts`), which repeats the shared
  fields and takes the parent's images; the file-image detail is in `nextjs.md` ("A page's `openGraph` drops ...").
- **Source:** Next `generate-metadata.md`; found by curl-testing the built site.

### No rich results to chase: FAQ gone, Event needs public events (2026-11-13)
- **Symptom:** the temptation to add FAQ or Event structured data to the home page for rich results.
- **Cause:** FAQ rich results were removed (deprecated 2026-05-07); Event rich results need public events at a
  physical place, and the club's events are members-only. `SportsClub` as a type needs a postal `address` (a
  `LocalBusiness`), and the club has no place to visit, so no Google Business Profile either.
- **Do:** home page structured data is `WebSite` (site name: `name`, `url`, `alternateName`) + `SportsOrganization`
  (`logo` >= 112 px); no FAQ or Event. Revisit Event when public events at a place exist (`docs/follow-ups.md`).
  JSON-LD is a plain `<script>`, not `InlineScript` (`ui.md`).
- **Source:** Google Search Central (site names 2025-12-10, Organization 2026-09-08, FAQ/Event pages).

### X and WhatsApp have no cache refresh tool (2026-11-13)
- **Symptom:** a wrong preview stays after the fix.
- **Cause:** X caches about 7 days and WhatsApp has no tool; Facebook (Sharing Debugger, also Instagram DMs) and
  LinkedIn (Post Inspector) can be refreshed. Facebook caches per image URL; Next's hashed `og:image` query string
  busts it on a change.
- **Do:** get the tags right before the first share; after a fix test by hand in WhatsApp, Telegram and iMessage.
  Telegram may show no preview at all because of an open bug (bugs.telegram.org/c/61650): don't chase it.
- **Source:** spec research, "After deploy" checklist.
