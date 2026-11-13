# SEO Round 1 (Technical) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ridevibe.com.tr crawlable, correctly labelled in Google and correctly previewed in chat apps, and stop
redirecting `/` by phone language — without any visible UI change.

**Architecture:** Small pure helpers in `src/lib/seo/` (site constants + URLs, page metadata, JSON-LD) used by the
`[locale]` layout, the public pages and new `src/app/robots.ts` / `src/app/sitemap.ts`. The proxy hands next-intl a
copy of the request without `Accept-Language`; the `NEXT_LOCALE` cookie gets a 1-year lifetime. A fetch-based check
script verifies the served HTML/headers locally and on production.

**Tech Stack:** Next.js 16 metadata API + file conventions, next-intl 4.14, `node --test`, sharp (one-off asset
conversion only, already present as Next's dependency).

**Spec:** `docs/superpowers/specs/2026-11-13-seo-technical-design.md` (read it first; it holds the research and the
reasons).

## Global Constraints

- Production origin, fixed everywhere (canonical, og:url, sitemap, JSON-LD): `https://ridevibe.com.tr`.
- Canonical / og:url strings must equal next-intl's hreflang header URLs: `https://ridevibe.com.tr/`,
  `https://ridevibe.com.tr/en`, `https://ridevibe.com.tr/apply`, `https://ridevibe.com.tr/en/apply` (root keeps its
  trailing slash, `/en` has none). No query string ever.
- Indexable: `/`, `/apply`, `/en`, `/en/apply` only. `noindex`: `/privacy`, `/en/privacy`, `/events`, `/gallery` (+ `/en`
  copies) and all already-noindex private pages.
- Open Graph shared fields: `type: "website"`, `siteName: "Ride & Vibe"`, `locale` `tr_TR` / `en_US`,
  `alternateLocale` = the other one. No `twitter:site`.
- Metadata, sitemap and robots must not read cookies/headers: `/`, `/apply`, `/privacy` stay prerendered (compare the
  `pnpm build` route table before/after).
- All copy in `messages/tr.json` + `messages/en.json` (TR is the source; same keys in EN). UI says "sen", the privacy
  notice says "siz".
- Tested modules import relatively with `.ts` extensions (`node --test` can't resolve `@/`).
- Commits: Conventional Commits, stage by path, no co-author trailers. Run lint, `tsc --noEmit`, `pnpm test`,
  `pnpm build` before every code commit.

## Review Focus

1. **A page that sets `openGraph` loses inherited tags** (Next overwrites nested objects per segment): every page must
   still emit `og:image` (+ width/height/type/alt) and `twitter:card`/`twitter:title`/`twitter:image`, with
   `twitter:title` equal to the page's `og:title` → asserted per URL in the check script (Task 6).
2. **Tracking or step params on a shared link** (`/apply?step=2&utm_source=ig`): canonical and og:url stay bare →
   check script fetches that URL.
3. **A preview crawler with an English recipient** (`User-Agent: WhatsApp/2…`, `Accept-Language: en`) fetching `/`
   gets 200 Turkish, not 307 → check script.
4. **An English chooser after a restart**: both cookie writers (proxy on a document visit to `/en`, client switcher)
   set `Max-Age` ≈ 31536000 → check script (proxy) + Task 1 browser step (client).
5. **Static routes turning dynamic** because a helper reads request data → Task 3/5 build-table comparison.

---

### Task 1: Ignore `Accept-Language`, remember the language for a year

**Files:**
- Modify: `src/proxy.ts`
- Modify: `src/i18n/routing.ts`
- Modify: `docs/learnings/next-intl.md` (entry: default `NEXT_LOCALE` is a session cookie; detection order prefix →
  cookie → `Accept-Language`; stripping the header keeps the cookie path; `syncCookie` sets the cookie only when the
  locale differs from the header-derived one)

**Interfaces:** none produced.

- [ ] **Step 1: Record the current route table** — run `pnpm build`, save the route list to the scratchpad for the
  Task 3/5 comparison.
- [ ] **Step 2: Implement** — in `proxy.ts`, build a request for next-intl only: same URL/method/cookies, headers
  without `accept-language` (research in the bundled Next docs how to clone a `NextRequest` with new headers in
  Next 16; `NextRequest` takes `(input: URL | RequestInfo, init?: RequestInit)`). Pass the original request to
  `updateSession` (it mutates `request.cookies`). In `routing.ts` add
  `localeCookie: { maxAge: 60 * 60 * 24 * 365 }` (next-intl merges it into `{ name: "NEXT_LOCALE", sameSite: "lax" }`;
  the client writer `syncLocaleCookie` reads the same config).
- [ ] **Step 3: Verify on `pnpm build && pnpm start -p 3123`**
  - `curl -sI -H 'Accept-Language: en' localhost:3123/` → `200`, no `location`.
  - `curl -sI -H 'Cookie: NEXT_LOCALE=en' localhost:3123/` → `307`, `location: /en`.
  - `curl -sI localhost:3123/en` → `set-cookie: NEXT_LOCALE=en; Path=/; Max-Age=31536000; …; SameSite=lax`.
  - `curl -sI localhost:3123/apply` → the hreflang `link:` header is still present (tr, en, x-default).
  - Browser (puppeteer, `PUPPETEER_DIR=~/e2e-tools`): open `/`, switch to English with the header switcher, read
    `document.cookie` / CDP cookies → `NEXT_LOCALE=en` with an expiry ~1 year ahead.
- [ ] **Step 4: Run** `PUPPETEER_DIR=~/e2e-tools node scripts/e2e/nav-e2e.mjs` and `cross-tab-e2e.mjs` → all PASS.
- [ ] **Step 5: Commit** `feat(i18n): ignore the browser language on first visit; remember the choice for a year`
  (proxy, routing, learnings).

### Task 2: Privacy notice mentions the language cookie and browser storage

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx` (~line 26 "Teknik veriler", ~line 90 section 7)
- Modify: `src/app/[locale]/privacy/content-en.tsx` (~line 30, ~line 94)
- Modify: `src/lib/applications/options.ts:57` — `PRIVACY_NOTICE_VERSION = "2026-11-13-draft-4"`

**Interfaces:** none.

- [ ] **Step 1: Write the text** — append to the "Teknik veriler" bullet (TR, "siz"), and the same meaning in EN:

  > Dil tercihinizi hatırlamak için bir dil çerezi (1 yıl). Ayrıca tarayıcınız; tema seçiminizi, son dil
  > değişikliğini, açık sekmeleri senkron tutmak için hesabınızdan türetilen kısa bir kodu, uygulama yükleme
  > önerisinin durumunu ve başvuru yaptığınıza dair bir işareti yalnızca kendi cihazınızda saklar. Bunlar sitenin
  > çalışması için gereklidir, sizi izlemek için kullanılmaz ve dil çerezi dışında bize gönderilmez.

  > A language cookie that remembers your language choice (1 year). Your browser also keeps, only on your device, your
  > theme choice, your last language switch, a short code derived from your account that keeps open tabs in sync, the
  > state of the install prompt and a note that you have applied. These are needed for the site to work, are not
  > used to track you and, except for the language cookie, are not sent to us.

  Section 7: "(oturum çerezi)" → "(oturum ve dil çerezleri)"; EN "(session cookie)" → "(session and language
  cookies)".
- [ ] **Step 2: Bump** `PRIVACY_NOTICE_VERSION` to `"2026-11-13-draft-4"`; grep tests for the old value and update
  any fixture that asserts it (`rg "2026-11-12-draft-3"`).
- [ ] **Step 3: Verify** lint, tsc, `pnpm test`, `pnpm build`; open `/privacy` and `/en/privacy` on `pnpm start` and
  read the bullet and the version line.
- [ ] **Step 4: Commit** `feat(privacy): mention the language cookie and browser storage (draft-4)`.

### Task 3: Site constants and per-page metadata

**Files:**
- Create: `src/lib/seo/site.ts`, `src/lib/seo/site.test.ts`
- Create: `src/lib/seo/metadata.ts`, `src/lib/seo/metadata.test.ts`
- Modify: `src/app/[locale]/layout.tsx` (`generateMetadata`)
- Modify: `src/app/[locale]/page.tsx` (add `generateMetadata`)
- Modify: `src/app/[locale]/apply/page.tsx`, `privacy/page.tsx`, `events/page.tsx`, `gallery/page.tsx`
- Modify: `messages/tr.json`, `messages/en.json`

**Interfaces:**
- Produces (`src/lib/seo/site.ts`, no imports beyond types):
  - `SITE_URL = "https://ridevibe.com.tr"`, `SITE_NAME = "Ride & Vibe"`, `SITE_ALTERNATE_NAME = "Ride and Vibe"`,
    `INSTAGRAM_URL = "https://www.instagram.com/rideandvibe34/"`, `LOGO_URL = "https://ridevibe.com.tr/brand/icon-512.png"`
  - `type PagePath = "/" | "/apply" | "/privacy" | "/events" | "/gallery"`
  - `localizedUrl(locale: Locale, path: PagePath): string`
  - `ogLocale(locale: Locale): "tr_TR" | "en_US"`
- Produces (`src/lib/seo/metadata.ts`):
  - `sharedOpenGraph(locale: Locale): { type: "website"; siteName: string; locale: string; alternateLocale: string[] }`
  - `pageMetadata(opts: { locale: Locale; path: PagePath; title: string; description: string; absoluteTitle?: boolean; index?: boolean }): Metadata`
    → `title` (`{ absolute }` when `absoluteTitle`), `description`, `alternates.canonical = localizedUrl(…)`,
    `openGraph = { ...sharedOpenGraph(locale), url: canonical, title, description }`, and `robots: { index: false }`
    only when `index === false` (key absent otherwise). No `twitter` key: Next fills twitter title/description/image
    from `openGraph` and the image file (verify in Step 6; if it doesn't, add `twitter` here and in the tests).

- [ ] **Step 1: Write failing tests** (`site.test.ts`, `metadata.test.ts`):

  ```ts
  assert.equal(localizedUrl("tr", "/"), "https://ridevibe.com.tr/");
  assert.equal(localizedUrl("en", "/"), "https://ridevibe.com.tr/en");
  assert.equal(localizedUrl("tr", "/apply"), "https://ridevibe.com.tr/apply");
  assert.equal(localizedUrl("en", "/apply"), "https://ridevibe.com.tr/en/apply");
  assert.equal(ogLocale("tr"), "tr_TR"); assert.equal(ogLocale("en"), "en_US");

  assert.deepEqual(sharedOpenGraph("en"), { type: "website", siteName: "Ride & Vibe", locale: "en_US", alternateLocale: ["tr_TR"] });
  const m = pageMetadata({ locale: "en", path: "/apply", title: "Apply to join", description: "d" });
  assert.equal(m.title, "Apply to join");
  assert.equal(m.alternates?.canonical, "https://ridevibe.com.tr/en/apply");
  assert.deepEqual(m.openGraph, { ...sharedOpenGraph("en"), url: "https://ridevibe.com.tr/en/apply", title: "Apply to join", description: "d" });
  assert.equal("robots" in m, false);
  const home = pageMetadata({ locale: "tr", path: "/", title: "T", description: "d", absoluteTitle: true });
  assert.deepEqual(home.title, { absolute: "T" });
  assert.deepEqual(pageMetadata({ locale: "tr", path: "/privacy", title: "P", description: "d", index: false }).robots, { index: false });
  ```
- [ ] **Step 2: Run** `pnpm test` → the new tests FAIL (modules missing).
- [ ] **Step 3: Implement** `site.ts` and `metadata.ts` (import `type Locale` from `next-intl`, `type Metadata` from
  `next`; `metadata.ts` imports `./site.ts`).
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Wire the pages and copy**
  - Messages (TR / EN): `Metadata.description` → the new home description; add `Metadata.homeTitle`; add
    `Privacy.description`. Exact strings from the spec's table:
    - `Metadata.homeTitle`: "Ride & Vibe · İstanbul Motosiklet Kulübü" / "Ride & Vibe · Istanbul Motorcycle Club"
    - `Metadata.description`: "İstanbul'un motosiklet kulübü. Hafta sonu sürüşleri, uzun turlar ve kahve buluşmaları;
      Asya'dan Avrupa'ya motorcularla tanış. Kulübe başvur." / "Istanbul's motorcycle club. Weekend rides, long tours
      and coffee meetups; meet riders from both sides of the city. Apply to join."
    - `Privacy.description`: "Ride & Vibe'ın kişisel verileri KVKK kapsamında nasıl işlediğini anlatan aydınlatma
      metni." / "How Ride & Vibe processes personal data under KVKK, Turkey's data protection law."
  - Layout `generateMetadata`: add `metadataBase: new URL(SITE_URL)` and `openGraph: sharedOpenGraph(await getLocale())`;
    keep the title template and default description.
  - `/`: `pageMetadata({ path: "/", title: Metadata.homeTitle, description: Metadata.description, absoluteTitle: true })`.
  - `/apply`: title `Apply.title`, description `Apply.intro` (unchanged texts).
  - `/privacy`: title `Privacy.title`, description `Privacy.description`, `index: false`.
  - `/events`, `/gallery`: title `Nav.events` / `Nav.gallery`, description `Metadata.description`, `index: false`.
  - Locale for the helper: `getLocale()` from `next-intl/server` (as `privacy/page.tsx` does).
- [ ] **Step 6: Verify on `pnpm build && pnpm start -p 3123`** — build route table equals Step 1 of Task 1 (same static
  markers). For `/`, `/en`, `/apply`, `/en/apply`, `/privacy`, `/events`: `curl -s … | grep -oE '<(title|meta|link)[^>]*>'`
  shows the right title, description, `rel="canonical"`, `og:url/type/site_name/locale/locale:alternate`, `og:image`
  (+ width/height/alt), `twitter:card`, `twitter:title` = `og:title`, `twitter:image`; `robots` noindex only on
  privacy/events/gallery; private pages (`/members`, `/account`, `/sign-in`) still `noindex`.
- [ ] **Step 7: Commit** `feat(seo): canonical URLs, Open Graph fields and page titles/descriptions`.

### Task 4: `robots.txt` and `sitemap.xml`

**Files:**
- Create: `src/app/robots.ts`, `src/app/sitemap.ts`, `src/app/seo-files.test.ts`

**Interfaces:**
- Consumes: `SITE_URL`, `localizedUrl` from `src/lib/seo/site.ts` (import as `../lib/seo/site.ts`, like
  `manifest.ts`).
- Produces: default exports `robots(): MetadataRoute.Robots`, `sitemap(): MetadataRoute.Sitemap`.

- [ ] **Step 1: Write failing tests** (`seo-files.test.ts`):

  ```ts
  assert.deepEqual(robots(), { rules: { userAgent: "*", allow: "/" }, sitemap: "https://ridevibe.com.tr/sitemap.xml" });
  assert.deepEqual(sitemap(), [
    { url: "https://ridevibe.com.tr/" }, { url: "https://ridevibe.com.tr/apply" },
    { url: "https://ridevibe.com.tr/en" }, { url: "https://ridevibe.com.tr/en/apply" },
  ]);
  ```
  (No `lastModified`, `changeFrequency`, `priority` or `alternates` — the deepEqual pins that.)
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Verify on `pnpm build && pnpm start -p 3123`** — build table lists `/robots.txt` and `/sitemap.xml` as
  static; `curl -si localhost:3123/robots.txt` → 200 `text/plain`, body has `Allow: /` and the `Sitemap:` line;
  `curl -si localhost:3123/sitemap.xml` → 200 `application/xml`, exactly the four `<loc>`s (not the 404 page).
- [ ] **Step 6: Commit** `feat(seo): robots.txt and sitemap.xml`.

### Task 5: Google-usable PNG icon and a lighter share image

**Files:**
- Create: `src/app/icon1.png` (192 × 192, copy of `public/brand/icon-192.png`; if Next won't emit both `icon.svg` and
  `icon1.png`, rename the SVG per the numbering rule in the bundled `app-icons.md` and note it in the learnings)
- Create: `src/app/[locale]/opengraph-image.jpg`; Delete: `src/app/[locale]/opengraph-image.png` (keep
  `opengraph-image.alt.txt`)

**Interfaces:** none.

- [ ] **Step 1: Convert the share image** with sharp from Next's own dependency (no new package):
  `node -e` with `require(<path from \`node -p "require.resolve('sharp', { paths: [require.resolve('next')] })"\`>)`,
  `.jpeg({ quality: 82, mozjpeg: true })`, 1200 × 630. Expected: file < 200 KB. Look at both images (Read tool) — same
  look, no visible banding; adjust quality if needed.
- [ ] **Step 2: Add the PNG icon**.
- [ ] **Step 3: Verify on `pnpm build && pnpm start -p 3123`** — home `<head>` has `<link rel="icon" … type="image/png"
  sizes="192x192">` plus the existing ico/svg/apple links; `og:image` ends in `.jpg`, `og:image:type` `image/jpeg`,
  1200 × 630; `curl -sI` on the image URL → 200 `image/jpeg`, `content-length` < 200000; route table unchanged.
- [ ] **Step 4: Commit** `feat(seo): PNG icon for Google and a lighter JPEG share image`.

### Task 6: Structured data on the home page + automated check

**Files:**
- Create: `src/lib/seo/json-ld.ts`, `src/lib/seo/json-ld.test.ts`
- Modify: `src/app/[locale]/page.tsx`
- Create: `scripts/e2e/seo-check.mjs`; Modify: `scripts/e2e/README.md`, `CLAUDE.md` (E2E command line: add
  `seo-check` and its `BASE=` usage)

**Interfaces:**
- Consumes: `SITE_URL`, `SITE_NAME`, `SITE_ALTERNATE_NAME`, `INSTAGRAM_URL`, `LOGO_URL` from `site.ts`.
- Produces: `clubJsonLd(description: string): Record<string, unknown>`, `serializeJsonLd(data: unknown): string`.

- [ ] **Step 1: Write failing tests** (`json-ld.test.ts`):

  ```ts
  const g = clubJsonLd("desc");
  assert.equal(g["@context"], "https://schema.org");
  const [site, org] = g["@graph"] as Record<string, unknown>[];
  assert.deepEqual(site, { "@type": "WebSite", "@id": "https://ridevibe.com.tr/#website", name: "Ride & Vibe",
    alternateName: "Ride and Vibe", url: "https://ridevibe.com.tr/", publisher: { "@id": "https://ridevibe.com.tr/#organization" } });
  assert.deepEqual(org, { "@type": "SportsOrganization", "@id": "https://ridevibe.com.tr/#organization", name: "Ride & Vibe",
    alternateName: "Ride and Vibe", url: "https://ridevibe.com.tr/", logo: "https://ridevibe.com.tr/brand/icon-512.png",
    sameAs: ["https://www.instagram.com/rideandvibe34/"], description: "desc", sport: "Motorcycling",
    areaServed: { "@type": "City", name: "Istanbul" } });
  assert.equal(serializeJsonLd({ a: "</script><b>" }), '{"a":"\\u003c/script>\\u003cb>"}');
  assert.deepEqual(JSON.parse(serializeJsonLd(g)), g);
  ```
- [ ] **Step 2: Run** `pnpm test` → FAIL.
- [ ] **Step 3: Implement** `json-ld.ts`; render
  `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(clubJsonLd(description)) }} />`
  in the home page (description = `Metadata.description` via `useTranslations("Metadata")`), as in the bundled
  `02-guides/json-ld.md`. Read the `InlineScript` entries in `docs/learnings/ui.md` first: it exists for executable
  scripts; if nothing there covers `application/ld+json`, keep the plain `<script>` and add a learnings line saying why.
- [ ] **Step 4: Run** `pnpm test` → PASS.
- [ ] **Step 5: Write `scripts/e2e/seo-check.mjs`** (plain `fetch`, `redirect: "manual"`, no puppeteer;
  `BASE` env, default `http://localhost:3123`; prints PASS/FAIL per check, exit 1 on any FAIL). Checks:
  - `/robots.txt` 200 text with `Sitemap: https://ridevibe.com.tr/sitemap.xml`; `/sitemap.xml` 200 with exactly the
    four production `<loc>`s.
  - For `/`, `/en`, `/apply`, `/en/apply`: 200; `<title>` and description non-empty and different between TR and EN;
    canonical = og:url = expected production URL; og:type/site_name/locale/locale:alternate as in Global
    Constraints; og:image + width/height/type/alt; twitter:card `summary_large_image`, twitter:title = og:title,
    twitter:image present; no `noindex`.
  - `/apply?step=2&utm_source=ig`: canonical and og:url = `https://ridevibe.com.tr/apply`.
  - `/privacy`, `/en/privacy`, `/events`, `/gallery`, `/members`, `/account`, `/sign-in`: `noindex`.
  - `/` and `/en`: exactly one `application/ld+json` script that `JSON.parse`s to a `@graph` with `WebSite` and
    `SportsOrganization`.
  - `/` with `User-Agent: WhatsApp/2.23.20.0 A` + `Accept-Language: en` → 200 and `<html lang="tr"`;
    `Cookie: NEXT_LOCALE=en` → 307 to `/en`; `/en` without cookie → `set-cookie` with `Max-Age=31536000`.
  - hreflang `link` header on `/apply` lists `tr`, `en`, `x-default` (compare paths, origins differ locally).
  - Home `<head>` has a PNG `rel="icon"` ≥ 48 px.
- [ ] **Step 6: Run** on `pnpm build && pnpm start -p 3123`: `node scripts/e2e/seo-check.mjs` → all PASS. The README
  documents both targets (local `pnpm start`, production via `BASE=`).
- [ ] **Step 7: Commit** `feat(seo): club structured data and an SEO check script`.

### Task 7: Docs and backlog

**Files:**
- Create: `docs/learnings/seo.md`; Modify: `docs/learnings/README.md` (index row "seo.md | Search, link previews,
  structured data")
- Modify: `docs/PLAN.md`, `docs/follow-ups.md`

- [ ] **Step 1: `docs/learnings/seo.md`** — entries (symptom → cause → do → source), each from the spec's research or
  this build: Google ignores SVG favicons (use PNG/ICO ≥ 48 on the home page); FAQ rich results removed (2026-05) and
  members-only events don't qualify; `/robots.txt` without a file is caught by `[locale]` (404 page,
  `lang="robots.txt"`); preview crawlers send the recipient's `Accept-Language` (WhatsApp) so locale redirects change
  previews; Next overwrites nested metadata objects per segment (`openGraph` needs the shared fields again — the
  helper); WhatsApp's official image limit is 600 KB, "300 KB" is folklore; X/WhatsApp have no cache refresh tool; plus
  anything discovered in Tasks 1–6.
- [ ] **Step 2: `docs/PLAN.md`** — Decisions table i18n row: "no browser-language detection: `/` is Turkish on a first
  visit; the explicit choice is remembered in `NEXT_LOCALE` for 1 year (2026-11-13, SEO)"; Status: SEO round 1 done
  (date); KVKK section: "No lawyer review (iltan, 2026-11-13): Claude researches and decides the open questions";
  reword "lawyer to confirm" lines accordingly.
- [ ] **Step 3: `docs/follow-ups.md`** — remove the SEO "Next up" item and "Privacy notice: cross-tab sync storage?";
  add to Next up (first): "SEO round 2: home content" (facts from iltan/Samet, design pass, spec section "Intent");
  add to Next up or Open decisions: "After-deploy SEO checklist" (spec's list) until iltan has done it; Features:
  index `/events` / `/gallery` when they have content, index `/privacy` + add to sitemap when the notice is final,
  Event structured data only for public events at a physical place; Parked: Telegram preview bug
  (bugs.telegram.org/c/61650), sitemap `lastmod` if pages get tracked edit dates; top of "Open decisions": "No lawyer
  (iltan, 2026-11-13): the 'lawyer' questions below are Claude's to research and decide."; add any review minors from
  the iteration.
- [ ] **Step 4: Commit** `docs(seo): learnings, plan and follow-ups for SEO round 1`.

## Rollout (after iltan's review and the `--no-ff` merge)

No database change. Push `main` → wait for the Vercel deploy (Ready) → `BASE=https://ridevibe.com.tr node
scripts/e2e/seo-check.mjs` → hand iltan the spec's "After deploy" checklist (sitemap submission, URL inspection,
Rich Results Test, Sharing Debugger, manual WhatsApp/Telegram/iMessage shares).
