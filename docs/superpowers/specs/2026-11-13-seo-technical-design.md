# SEO, round 1: technical — design

Date: 2026-11-13 · Status: draft for iltan's review · Backlog item: "SEO" in `docs/follow-ups.md` (Next up)

## Intent

People in Istanbul who have a motorcycle and look for a club to ride and socialise with (searching e.g. "İstanbul
motosiklet kulübü") should find ridevibe.com.tr in Google, see a clear result (club name, logo, a description that
says what the club is) and apply. Links shared in WhatsApp, Instagram DMs, Telegram, X etc. should show a correct
preview. iltan verified the domain in Google Search Console (DNS TXT, 2026-11-12); nothing else exists yet.

SEO is split in two rounds (iltan, 2026-11-13):
1. **This round — technical.** Everything search engines and link previews read; no visible UI change.
2. **Next round — content.** Real club information on the home page (what rides look like, who it's for, how to
   join), needs facts from iltan/Samet and a design pass. It is the bigger ranking lever (Google's helpful-content
   guidance); round 1 makes sure Google can read and label the site correctly first.

## Research basis (checked 2026-11-13; rules change often — re-check anything that looks off)

Google Search Central (live pages, dates are their "last updated"):
- **Favicon in results** (`/search/docs/appearance/favicon-in-search`, 2026-10-27): taken from `<link rel="icon">`
  (or `apple-touch-icon`) on the **home page**; square, ≥ 8 px, "larger than 48x48px" recommended; formats BMP, GIF,
  ICO, PNG, JPEG, PPM, TIFF — **SVG is not listed**; stable URL; one per hostname; shows after days to weeks.
- **Site name** (`/search/docs/appearance/site-names`, 2025-12-10): `WebSite` structured data (`name`, `url`,
  optional `alternateName`) on the home page; no subdirectory-level site names (`/en` inherits the domain's).
- **Organization** (`/search/docs/appearance/structured-data/organization`, 2026-09-08): no required properties; use
  the most specific subtype; `logo` ≥ 112 × 112, crawlable, must look right on white; feeds knowledge panel/logo slots.
  `SportsOrganization` is a direct Organization subtype; `SportsClub` is a `LocalBusiness` (Google requires `address`).
- **No rich results for us:** FAQ rich results were removed (deprecated 2026-05-07); Event rich results need public
  events at a physical place, members-only events are ineligible.
- **hreflang** (`/search/docs/specialty/international/localized-versions`, 2026-09-21): HTML tags, HTTP `Link`
  headers and sitemap are equivalent; using several has "no benefit". Each version lists itself and the others.
- **Language redirects** (multi-regional guide, 2025-12-10): avoid automatic redirects by language; Googlebot sends no
  `Accept-Language`.
- **Canonical** (`/search/docs/crawling-indexing/consolidate-duplicate-urls`, 2026-07-10): self-referencing absolute
  canonical in the server HTML; each language version canonicalises to itself; tracking params get consolidated.
- **Sitemaps** (2026-07-08): `priority`/`changefreq` ignored; `lastmod` only used when consistently accurate; worth
  having for a new site with few external links; submit in Search Console.
- **robots.txt vs noindex** (2025-12-10): a disallowed page's `noindex` is never seen, so don't disallow noindex pages.
  A 4xx robots.txt = "no robots.txt". Near-empty 200 pages get reported as soft 404s.
- **Titles/snippets** (2025-12-10 / 2026-04-20): no length limit, unique and descriptive per page; Google also reads
  `og:title` for title links.
- **Google Business Profile** needs a place customers visit (or service at their location) → the club doesn't qualify.

Link previews (official docs where they exist):
- **WhatsApp** (Meta business-messaging "Link Previews"): needs `og:title`, `og:description`, `og:url` (undecorated,
  no tracking params) in `<head>` within the first 300 KB of HTML; absolute `og:image` **< 600 KB**, ≥ 300 px wide,
  aspect ≤ 4:1. The crawler sends the **recipient's** language as `Accept-Language`. The "300 KB" limit seen online is
  unofficial. No refresh tool.
- **Facebook / Messenger / Instagram DMs**: `og:type` (default `website`), `og:locale` (default `en_US`) +
  `og:locale:alternate`; image ≥ 1200 × 630 recommended, 1.91:1, ≤ 8 MB, cached per image URL (Next's hashed query
  string busts it). Refresh: Sharing Debugger (also covers Instagram DMs, community-observed).
- **X**: falls back to `og:*`; `summary_large_image` ≤ 5 MB, ~2:1; honours robots.txt; `twitter:site` must be an X
  handle (the club has none → omit). Cache ~7 days, no refresh tool.
- **LinkedIn**: `og:title/description/image/url`; image ≥ 1200 × 627. Refresh: Post Inspector.
- **iMessage** (Apple TN3156, 2024): `og:title` without branding, `og:site_name` for the brand, image ≥ 900 px wide.
- **Telegram**: no official docs; `twitter:card=summary_large_image` gives the large layout (community); an open bug
  (bugs.telegram.org/c/61650, active 2026-11) drops valid previews → test by hand, don't chase.
- **Discord**: reads `og:image` + width/height, `twitter:card` for the large layout. **Slack** ignores robots.txt.

## What exists today (live site, 2026-11-13)

- `/robots.txt` and `/sitemap.xml` don't exist; both are caught by the `[locale]` catch-all and return a 404 page.
- `Metadata.title/description` in the `[locale]` layout (title template `%s · Ride & Vibe`); only `/apply` has its own
  description; `/en` has the same `<title>` as `/`. No `metadataBase`, no canonical, no `og:url`, `og:type`,
  `og:site_name`, `og:locale`. `og:image` comes from `src/app/[locale]/opengraph-image.png` (1200 × 630 PNG,
  **309 KB**, alt "Ride & Vibe") at `https://ridevibe.com.tr/-/opengraph-image.png?…` (works, 200).
- hreflang: next-intl's proxy already sends `Link` headers (tr, en, x-default → Turkish URL) on every page.
- Icons: `src/app/favicon.ico` (16, 32 and 48 px inside — checked the ICO header; Google accepts ICO),
  `src/app/icon.svg` (Google can't use SVG), `src/app/apple-icon.png` (180 px). Brand PNGs in `public/brand/` (192,
  512, maskable 512).
- Private pages (account, members, admin, sign-in) already set `robots: { index: false }`. `/events` and `/gallery`
  are indexable "Çok yakında" placeholders.
- **Language redirect:** next-intl's default `localeDetection` sends `/` → `/en` (307) when there is no `NEXT_LOCALE`
  cookie and `Accept-Language` prefers English — also for WhatsApp/Meta/Telegram preview crawlers (verified with curl).

## Goals

1. Google can crawl, index and label the public pages correctly: `robots.txt`, `sitemap.xml`, self-canonicals,
   distinct titles/descriptions per page and language, `noindex` on the placeholders and on the draft privacy notice.
2. Google shows the club's own icon and name in results: a PNG favicon, `WebSite` + `SportsOrganization` structured
   data.
3. Link previews are complete and consistent on every platform listed above.
4. `/` is Turkish on a first visit regardless of the phone/browser language; an explicit English choice is
   remembered for a year, across browser and installed-app restarts.
5. A short post-deploy checklist gets the sitemap submitted and the home pages re-crawled.

## Non-goals

- Home-page content and any visible UI change (round 2).
- Google Business Profile (not eligible), IndexNow / `llms.txt` (not used by Google), Speed Insights (separate open
  decision in follow-ups), per-page OG images, Event structured data (no public events yet), FAQ markup (removed).
- hreflang in HTML or in the sitemap (headers already do it; a second method adds nothing).

## Anti-goals (a failure even if it "works")

- Any private page (account, members, admin, application detail) indexed or listed in the sitemap.
- A public route turning dynamic: metadata, sitemap and robots must not read cookies/headers (Cache Components; keep
  `/`, `/apply`, `/privacy` prerendered — check the build output).
- An English-choosing member no longer landing on English (in the browser or in the installed app, which opens `/`).
- `og:url` / canonical with query params (`?step=`, `utm_*`), or pointing at a preview deployment.

## Approaches considered

- **Rounds:** (a) technical now, content next round — **chosen** (iltan): ships in days, sitemap can be submitted, the
  content work needs facts and design anyway; (b) one combined round — everything waits on copy.
- **Language redirect on `/`:** (1) **ignore `Accept-Language`, keep the `NEXT_LOCALE` cookie — chosen** (iltan);
  (2) next-intl `localeDetection: false` — also drops the cookie, so English choosers land on Turkish every time
  (installed app included); (3) keep as is — many Turkish riders use English phones and land on English pages and
  previews; Google advises against it. This reverses the "browser-language detection" part of the i18n decision in
  `docs/PLAN.md` (update the table).
- **How long English is remembered:** `NEXT_LOCALE` is a session cookie today (next-intl 4.14 sets only `name` +
  `sameSite: lax`; verified on the live site), harmless while `Accept-Language` did the work. (a) **1-year cookie +
  one sentence in the privacy notice — chosen** (iltan); (b) session only — English choosers start in Turkish after
  every browser/app restart.
- **Draft privacy notice:** (a) **`noindex` until the notice is final — chosen** (iltan); (b) index now — the visible
  "TASLAK" text can show in results. There is no lawyer review (iltan, 2026-11-13): Claude finalises the notice later.
- **hreflang method:** keep next-intl's `Link` headers only (Claude's call; equivalent per Google, already on every
  page, no second source of truth).
- **Organization type:** `SportsOrganization` (Claude's call; `SportsClub` would require a street address).

## Design

### 1. Language detection (`src/proxy.ts`)
Pass next-intl's middleware a copy of the request **without the `Accept-Language` header**; keep everything else
(cookie included) and give `updateSession` the original request as today. Effects with next-intl 4.14
(`resolveLocale.js`, `syncCookie.js`): prefix → cookie → default `tr`. A document visit to `/en…` without a cookie
sets `NEXT_LOCALE=en` (because the header-derived locale is now `tr`); the switcher sets the cookie on a client-side
switch as today. So: first visit to `/` = Turkish for everyone and every crawler; someone who chose or opened English
is remembered. Research how to clone a `NextRequest` with modified headers in Next 16 (bundled docs) and confirm the
hreflang `Link` header and the cookie still behave.

**Cookie lifetime:** set `localeCookie: { maxAge: 60 * 60 * 24 * 365 }` in `src/i18n/routing.ts` (next-intl merges it
into `{ name: "NEXT_LOCALE", sameSite: "lax" }`). Check that both writers use it: the proxy (`syncCookie`) and the
client-side switch (`router.replace(…, { locale })`).

**Privacy notice:** the "Teknik veriler" bullet (`privacy/content-tr.tsx` ~line 26, and the English copy) names only
the session cookie and the application draft. Add one sentence (TR + EN, "siz" register) covering the language
preference cookie (1 year) and what the browser keeps in `localStorage`: theme, last language switch (`rv-locale`),
a short hash for keeping open tabs in sync (`rv-auth`), the install-prompt state (`rv-install-dismissed`,
`rv-install-installed`) and the "already applied" hint (`rv-apply-hidden`) — technically necessary, no tracking, not
sent to us (the cookie is, for the language). Also check the collection-method sentence (~line 90, "oturum çerezi").
Bump `PRIVACY_NOTICE_VERSION`. This settles the follow-up "Privacy notice: cross-tab sync storage?" (remove it).

### 2. Metadata base and per-page metadata
- `metadataBase: new URL("https://ridevibe.com.tr")` in the `[locale]` layout (fixed production origin, also on
  previews and locally, so canonicals never point at a preview).
- Layout also sets the shared Open Graph fields: `type: "website"`, `siteName: "Ride & Vibe"`, `locale` `tr_TR` /
  `en_US` and `alternateLocale` (the other one), keep `twitter:card = summary_large_image`, no `twitter:site`.
- **Next overwrites nested metadata objects** (`openGraph`, `robots`, `alternates`) per segment instead of merging
  (bundled `generate-metadata.md`, "Overwriting fields"). Any page that sets `openGraph` must repeat the shared fields
  and keep the OG image — use one small shared helper (e.g. `src/lib/seo/metadata.ts`) that builds `alternates.canonical`
  + `openGraph` (url, title, description, shared fields) for a locale + path, so pages can't drift.
- Indexable pages (`/`, `/apply` and their `/en` copies) get: absolute self-canonical without query string,
  `og:url` equal to the canonical, `og:title` / `og:description` equal to the page's own. Canonical URLs must match the
  hreflang header URLs exactly (`https://ridevibe.com.tr/`, `…/en`, `…/apply`, `…/en/apply`; check the trailing-slash
  form Next emits for the root).
- Titles/descriptions (draft copy, iltan reviews; "kulübü" rather than "topluluğu" because that's what people search):

  | Page | TR title | TR description | EN title | EN description |
  |---|---|---|---|---|
  | `/` (absolute title) | Ride & Vibe · İstanbul Motosiklet Kulübü | İstanbul'un motosiklet kulübü. Hafta sonu sürüşleri, uzun turlar ve kahve buluşmaları; Asya'dan Avrupa'ya motorcularla tanış. Kulübe başvur. | Ride & Vibe · Istanbul Motorcycle Club | Istanbul's motorcycle club. Weekend rides, long tours and coffee meetups; meet riders from both sides of the city. Apply to join. |
  | `/apply` | Kulübe başvur (unchanged, template adds the brand) | unchanged ("4 kısa adımda…") | Apply to join (unchanged) | unchanged |
  | `/privacy` | Aydınlatma Metni (unchanged) | Ride & Vibe'ın kişisel verileri KVKK kapsamında nasıl işlediğini anlatan aydınlatma metni. | Privacy notice (unchanged) | How Ride & Vibe processes personal data under KVKK, Turkey's data protection law. |

  The layout default description (used by noindex pages) becomes the home description. The privacy description is
  page metadata, not notice text, so `PRIVACY_NOTICE_VERSION` does not change. All copy goes into `messages/*.json`.
- `/events` and `/gallery`: `robots: { index: false }` while they show "Çok yakında"; not in the sitemap. Add a
  follow-up to make them indexable when they get content.
- `/privacy`: `robots: { index: false }` while the notice is a draft (it shows "TASLAK" and placeholders); not in the
  sitemap. It still gets its description, canonical and `og:url` (a shared link previews correctly, and nothing is
  missing when it becomes indexable). Follow-up: index it and add it to the sitemap when the notice is final.

### 3. `robots.txt` and `sitemap.xml`
- `src/app/robots.ts`: allow everything for every user agent (noindex pages must stay crawlable; preview crawlers need
  the page and the image), plus `Sitemap: https://ridevibe.com.tr/sitemap.xml`.
- `src/app/sitemap.ts`: the four indexable URLs (`/`, `/apply`, `/en`, `/en/apply`), absolute,
  no `priority`/`changefreq`, no `lastmod` (we can't keep it accurate without tracking edits; Google ignores
  inaccurate ones), no hreflang (headers do it).
- Both must be served by these files, not the `[locale]` catch-all (today `/robots.txt` renders the 404 page with
  `lang="robots.txt"`): verify status + content type on `pnpm start`. They must stay static.

### 4. Icons and logo
- Add a square PNG icon ≥ 48 px (e.g. 192 px from the existing brand icon) through Next's icon file convention so the
  home page `<head>` has a Google-usable `<link rel="icon" type="image/png">`; keep the SVG for browsers that prefer
  it, the 180 px apple icon and `favicon.ico` (already 16/32/48, usable by Google but not "larger than 48").
  Research the convention's ordering/numbering (bundled `app-icons.md`: numbered files sort
  lexically) so the PNG is emitted.
- Organization `logo`: `https://ridevibe.com.tr/brand/icon-512.png` (dark rounded tile with the cream R&V; reads
  fine on white, checked).

### 5. Structured data (home page, both locales)
One `<script type="application/ld+json">` with an `@graph`, rendered in `src/app/[locale]/page.tsx` as the bundled
JSON-LD guide recommends (`JSON.stringify` + `<` → `<`). It is data, not executable code; check whether the
`InlineScript` rule in CLAUDE.md is meant to cover it (`docs/learnings/ui.md`) and note the outcome there.
- `WebSite`: `@id https://ridevibe.com.tr/#website`, `name "Ride & Vibe"`, `alternateName "Ride and Vibe"`,
  `url https://ridevibe.com.tr/`, `publisher` → the organization.
- `SportsOrganization`: `@id https://ridevibe.com.tr/#organization`, `name`, `alternateName` (same as above), `url`,
  `logo` (above), `sameAs ["https://www.instagram.com/rideandvibe34/"]` (the WhatsApp channel is private → not
  listed), `description` (the page's localized description), `sport "Motorcycling"`, `areaServed` Istanbul.
- Same graph on `/` and `/en` (only `description` localized); `url` always the domain root (one site name per site).
- Keep it in one builder function with a unit test (shape, escaping).

### 6. Share image
Keep 1200 × 630 and the same look; shrink well below 300 KB (e.g. JPEG ~100–200 KB via `opengraph-image.jpg`, or an
optimised PNG). Keep width/height/type/alt tags (Next emits them from the file convention).

## Verification (before merge)

- `pnpm lint`, `tsc`, `pnpm test` (helper, sitemap, robots, JSON-LD units), `pnpm build` (routes stay static).
- On `pnpm start -p 3123`, with curl: `/robots.txt` and `/sitemap.xml` (200, right content type); `<head>` of the four
  indexable URLs and both privacy URLs (title, description, canonical, og:url/type/site_name/locale/alternate,
  og:image); `noindex` on `/events`, `/gallery`, `/privacy`, `/en/privacy` and still on the private pages; JSON-LD
  parses; `/` with `Accept-Language: en` → 200 Turkish; `/` with `NEXT_LOCALE=en` → 307 `/en`; a first visit to `/en`
  sets `NEXT_LOCALE=en` with a ~1-year `Max-Age`; hreflang `Link` headers unchanged; icons in the home `<head>`.
- Browser E2E: run the existing suites that touch locale (nav, cross-tab, apply-nav); the language switch still sticks
  and its cookie has the 1-year lifetime (client-side writer).

## After deploy (checklist for iltan, Claude helps where it can)

1. Search Console: submit `https://ridevibe.com.tr/sitemap.xml`; URL inspection → request indexing for `/` and `/en`.
2. Rich Results Test / Schema Markup Validator on `/` (no rich result expected; it should parse without errors).
3. Facebook Sharing Debugger: scrape `/` and `/en` (refreshes Facebook, Messenger, Instagram DMs); LinkedIn Post
   Inspector optional.
4. Share a link by hand in WhatsApp, Telegram and iMessage (no refresh tools; Telegram may not show a preview at all
   because of its open bug).
5. The favicon and site name take days to weeks to appear.

## Docs to update with the work

- `docs/PLAN.md`: i18n row (no browser-language detection; remembered choice, 1-year cookie); status line; KVKK
  section: no lawyer review (iltan, 2026-11-13), Claude researches and decides the open questions.
- `docs/follow-ups.md`: remove the SEO "Next up" item and "Privacy notice: cross-tab sync storage?"; add "SEO round 2:
  home content" to Next up; add: make `/events` / `/gallery` indexable with real content, index `/privacy` (+ sitemap)
  when the notice is final, Event structured data only if public events at a place appear, `lastmod` if pages get
  tracked edit dates, Telegram preview bug; note at the top of "Open decisions" that the "lawyer" questions are now
  Claude's to research and decide (no lawyer, iltan 2026-11-13).
- `docs/learnings/seo.md` (new, index in its README): favicon SVG not used by Google, FAQ rich results gone,
  catch-all route swallowing `robots.txt`, preview crawlers send the recipient's `Accept-Language`, Next overwrites
  nested metadata objects.

## Left to the builder

File/helper names, how the request is cloned in the proxy, the exact icon file name and size, JPEG vs PNG for the
share image, test layout.
