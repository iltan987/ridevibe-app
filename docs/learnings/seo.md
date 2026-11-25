# SEO, link previews, structured data

Spec and research basis (checked 2026-11-13): `docs/superpowers/specs/2026-11-13-seo-technical-design.md`. Check
everything here against the live Google/Meta docs when it looks off; the rules change often. Check the deployed site
with `scripts/e2e/seo-check.mjs` (`scripts/e2e/README.md`).

### Google ignores SVG favicons (2026-11-13)
- **Symptom (expected, per Google's docs; the site is not crawled yet):** with only `icon.svg` + `favicon.ico` +
  `apple-icon.png`, Google would not show a favicon in search results.
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
- **Do:** convert with Next's own sharp (`environment.md`, "sharp from Next's own dependency"),
  `.jpeg({ quality: 82, mozjpeg: true })`: 317 KB became 69 KB. `opengraph-image.jpg` is picked up by the file
  convention (`src/app/[locale]/opengraph-image.jpg`, served from `/-/opengraph-image.jpg`, next entry).
- **Source:** Meta business-messaging docs "Link Previews"; found by testing.

### `opengraph-image.jpg` in `[locale]` is served from `/-/opengraph-image.jpg` (2026-11-09)
- **Symptom:** `og:image` content is `…/-/opengraph-image.jpg?<hash>` (HTML of `/` and `/en`);
  `/opengraph-image.jpg` is 404.
- **Cause:** the dynamic segment is replaced by `-` in the metadata route; it works (200, image/jpeg;
  the file was a PNG until 2026-11-13).
- **Do:** nothing. `og:image` is absolute, built from `metadataBase`, which is fixed to the production origin
  (see `nextjs.md`).
- **Source:** found by testing the built site (brand and link-preview commit 3b2c0e9).

### A page's `openGraph` replaces the layout's: shared fields and the file-based image (2026-11-13)
- **Symptom:** a page that sets `openGraph` (e.g. `/apply` in `generateMetadata`) loses the shared fields
  (`siteName`, `locale`, `type`, `images`): its `og:image` and `twitter:image` vanished and `twitter:card` fell back to
  `summary`; pages without `openGraph` kept the image.
- **Cause:** Next merges metadata shallowly per segment: a nested object like `openGraph` replaces the parent's whole
  object, file-based images included (the file image is attached at the segment that holds the file; its hashed URL
  can't be hardcoded). Likewise an `images` key in the page's own `openGraph` makes Next skip the segment's file image
  (`mergeStaticMetadata` in `next/dist/lib/metadata/metadata-resolution-primitives.js`).
- **Do:** build every page's metadata through `pageMetadata` (`src/lib/seo/metadata.ts`), which repeats the shared
  fields and takes the parent's images: `generateMetadata(_props, parent: ResolvingMetadata)` and
  `images: (await parent).openGraph?.images` into `openGraph`.
- **Source:** Next `generate-metadata.md` ("Extending or overwriting parent images"); found by curl-testing the built
  site.

### A generated `opengraph-image` under `[locale]` gets a `/tr/` URL; ImageResponse caches for a year (2026-11-24)
- **Symptom:** with `src/app/[locale]/events/[id]/opengraph-image.tsx`, the Turkish page's `og:image` was
  `https://ridevibe.com.tr/tr/events/<id>/opengraph-image?<hash>`; the locale proxy answers that with a 307 to the
  unprefixed path (and turns the query into `?<hash>=`). The PNG itself came with
  `cache-control: public, immutable, no-transform, max-age=31536000`.
- **Cause:** Next fills the metadata image URL from the internal route params (`locale: "tr"`); `localePrefix:
  "as-needed"` redirects the default prefix. `ImageResponse` (`@vercel/og`) sets that header in production unless
  `headers` overrides it. A page whose own `openGraph` has an `images` key makes Next skip the segment's file image
  (entry above).
- **Do:** name the image in the page's `generateMetadata` (`eventImageUrl` in `src/lib/seo/site.ts`, size
  `OG_IMAGE_SIZE`, `type`, `alt`); the file stays the route. Pass `headers: { "cache-control": … }` to
  `ImageResponse` when the image follows data (`public, max-age=3600` beside a `cacheLife("hours")` read;
  `no-store` for a fallback after a failed read). Vercel's CDN caches a function response only with `s-maxage` /
  `CDN-Cache-Control`, so `max-age` alone reaches browsers and crawlers only. Fonts: satori takes ttf/otf/woff and no
  variable fonts; google/fonts has Saira at normal width only as a variable font, so the image uses the static
  `SairaExtraCondensed-ExtraBold` / `SairaSemiCondensed-SemiBold` (`src/assets/fonts/`, OFL, reserved name "Saira":
  ship the files unmodified). Text clamping in satori needs `display: "block"` + `lineClamp: 2` (ellipsis included).
  Check the PNGs by eye (`scripts/e2e/events-public-e2e.mjs` saves them to `OUT_DIR`).
- **Source:** bundled `opengraph-image.md` / `image-response.md`; `next/dist/compiled/@vercel/og/index.node.js`;
  Vercel docs "CDN cache"; found by testing.

### `generateMetadata` reading params + a cached read: streamed for browsers, in `<head>` only for listed bots (2026-11-24)
- **Need:** per-event link previews on `/events/[id]` (`generateMetadata({ params })` → `getEventPreview(id)`, a
  `"use cache"` read) under Cache Components.
- **Observed:** `pnpm build` accepts it with no marker: the page already has request-time content behind
  `<Suspense>` (the session), so metadata just defers with it (`generate-metadata.md`, "With Cache Components"; only an
  otherwise fully prerenderable page would need `"use cache"` in `generateMetadata` or a dynamic marker). The tags
  then **stream**: for a normal browser (`curl`, `fetch` with Node's UA) `og:title` etc. arrive at the end of
  `<body>`; for an HTML-limited bot (`HTML_LIMITED_BOT_UA_RE` in `next/dist/shared/lib/router/utils/html-bots.js`:
  WhatsApp, facebookexternalhit, Twitterbot, Slackbot, Discordbot, LinkedInBot, …; Telegram's
  "TelegramBot (like TwitterBot)" matches via "TwitterBot") rendering blocks and they are in `<head>`.
- **Do:** check preview tags with a bot user agent (`User-Agent: WhatsApp/2.23.20.0 A`) and assert they sit before
  `</head>` (`scripts/e2e/events-public-e2e.mjs`); a body-only match from a plain `fetch` proves nothing about previews.
  Keep the uuid check outside the cached function so junk ids make no cache entry (`getEventPreview` →
  `readEventPreview`).
- **Source:** bundled `generate-metadata.md` ("Streaming metadata", "With Cache Components"); found by testing.

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

### No rich results to chase: FAQ gone, Event needs a public place (2026-11-13, updated 2026-11-25)
- **Symptom:** the temptation to add FAQ or Event structured data to the home page for rich results.
- **Cause:** FAQ rich results were removed (deprecated 2026-05-07). Event rich results need an event with a physical
  location (a place with an address): the public event teasers (since 2026-11-24: `/events`, `/events/[id]`, the home
  page's next rides) show only title, kind, Istanbul day and area, never the time or the place, and `/events/[id]` is
  `noindex`; the full events stay members-only. `SportsClub` as a type needs a postal `address` (a `LocalBusiness`),
  and the club has no place to visit, so no Google Business Profile either.
- **Do:** home page structured data is `WebSite` (site name: `name`, `url`, `alternateName`) + `SportsOrganization`
  (`logo` >= 112 px); no FAQ or Event. Revisit Event only if events with a public place appear
  (`docs/follow-ups.md`). JSON-LD is a plain `<script>`, not `InlineScript` (`ui.md`).
- **Source:** Google Search Central (site names 2025-12-10, Organization 2026-09-08, FAQ/Event pages).

### X and WhatsApp have no cache refresh tool (2026-11-13)
- **Symptom:** a wrong preview stays after the fix.
- **Cause:** X caches about 7 days and WhatsApp has no tool; Facebook (Sharing Debugger, also Instagram DMs) and
  LinkedIn (Post Inspector) can be refreshed. Facebook caches per image URL; Next's hashed `og:image` query string
  busts it on a change.
- **Do:** get the tags right before the first share; after a fix test by hand in WhatsApp, Telegram and iMessage.
  Telegram may show no preview at all because of an open bug (bugs.telegram.org/c/61650): don't chase it.
- **Source:** spec research, "After deploy" checklist.
