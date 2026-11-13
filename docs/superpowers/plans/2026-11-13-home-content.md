# Home-page content (SEO round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/` into a real club page (photo hero, rides, who can join, how to join, rules, FAQ, closing call to
action) with four consented photos, and extend the privacy notice to cover photos on the public website.

**Architecture:** The home page stays a static Server Component; each section is a small component in
`src/components/home/`, all copy in `messages/{tr,en}.json` (`Home.*`). Photos are pre-cropped JPEGs in
`src/assets/home/`, statically imported into `next/image` (blur placeholder, responsive sizes, `preload` on the hero).
Only the two "Kulübe Başvur" buttons stream (existing `HeroApplyGuess` / `HeroApplyForUser` pair).

**Tech Stack:** Next.js 16 App Router (Cache Components), next-intl 4, Tailwind CSS 4, `next/image`, sharp (Next's own
dependency, one-off), `node --test`, puppeteer E2E scripts.

**Spec:** `docs/superpowers/specs/2026-11-13-home-content-design.md` (approved 2026-11-13). Executors read both; the
Turkish copy there is final and is not repeated here.

## Global Constraints

- Branch `feat/home-content`; Conventional Commits; stage files by path; never stage `.claude/settings.json`; **no
  `Co-Authored-By` or other trailer**.
- Before every commit that touches code: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` all pass.
- Turkish copy = the spec's "Page structure and copy" section, verbatim. English = the table in Task 2, verbatim.
- Copy never says "ücretsiz"/"free", "kahve(de)"/coffee-house, "sohbet", or who pays for what (iltan's rules).
- No hard-coded UI strings; every `Home.*` key exists in both `tr.json` and `en.json`.
- `/` stays prerendered: nothing reads cookies/headers outside the Başvur `Suspense` boundaries; build output must not
  turn `/[locale]` dynamic.
- Only the four prepared photos from Task 1; alt texts describe the scene, never names.
- Hero `<section>` carries the `dark` class (always night palette); everything else follows the theme. Orange text uses
  `text-accent-text`.
- `heading` / `eyebrow` utilities uppercase via CSS: never put English or brand words in them on Turkish pages.
- Links from `@/i18n/navigation`; mobile-first (390 px), desktop at `md:`/`lg:`.
- The share image (`src/app/[locale]/opengraph-image.jpg`) and the JSON-LD do not change.

## Review Focus

1. **Signed-in member or open applicant** — both Başvur buttons are hidden; hero and closing must still look finished
   (no empty button gap, no orphaned spacing). Task 3 step 6 checks the member view at 390/1280.
2. **Light theme** — hero text must stay cream on the dark gradient (the `dark` class), sections below must use the
   light tokens with readable contrast. Task 2 step 7 / Task 3 step 6 check both themes.
3. **English at 360–390 px** — longer English strings (stats labels, step titles, chips) must wrap, not overflow.
   Task 3 step 6 checks `/en` at 360 px with `document.documentElement.scrollWidth === innerWidth`.
4. **Slow network / before the photo loads** — hero text readable on the dark background, blur placeholder shown, no
   layout shift (CLS 0 from photos). Task 6 step 3 measures CLS with throttling.
5. **Crawlers and JS-off** — all section copy, including FAQ answers, must be in the server HTML. Task 6 step 2 greps
   the HTML of `/` and `/en`.

---

### Task 1: Prepare and commit the four photos (main session; needs iltan's eye check)

Done by the coordinating session, not a subagent: iltan approves the prepared images before they are committed.

**Files:**
- Create: `src/assets/home/hero-road.jpg`, `src/assets/home/rides-kiz-kulesi.jpg`,
  `src/assets/home/who-terrace.jpg`, `src/assets/home/closing-breakfast.jpg`
- Scratch (not committed): a sharp script in the session scratchpad

**Interfaces:**
- Produces: the four JPEG paths above (static imports for Tasks 2–3).

- [ ] **Step 1: Write the prep script** (scratchpad, CommonJS, sharp via
  `require(require.resolve('sharp', { paths: [require.resolve('next', { paths: [process.cwd()] })] }))`, run from the
  repo root). Sources in `/mnt/c/Users/iltan/Desktop/abc1234/WhatsApp Image 2026-11-13 at …` per the spec's photo
  table. Per photo: `.rotate()` → `.extract({ left, top, width, height })` (crop) → optional blur composite →
  `.jpeg({ quality: 85, mozjpeg: true })`; never `.withMetadata()`, never upscale.
  - Crops (pick rectangles by viewing the originals; record them in the commit message):
    - hero (1600×1200): keep everything except stray edge strangers (none expected); landscape stays landscape.
    - Kız Kulesi (1600×1200): cut the small passers-by at the far left.
    - terrace (1536×2048): unchanged (name patches stay, iltan 2026-11-13).
    - breakfast (1200×1600): crop to 1200×760 from y = 640 (the long club table); soft-blur the other diners on the
      right (blur instead of crop: a crop would cut the red-shirt member).
    - Done in the main session 2026-11-13: soft blur = per region, blurred padded patch with a feathered alpha pasted
      back (sharp's `joinChannel` + `removeAlpha` on a whole image silently lost the alpha; see learnings).
- [ ] **Step 2: Run it** into the scratchpad and check each output: `sharp(f).metadata()` has no `exif`, `icc` is
  fine; dimensions ≤ original.
- [ ] **Step 3: Show iltan** the four files (absolute scratchpad paths, and view them yourself). Wait for OK; redo crops
  on feedback.
- [ ] **Step 4: Copy to `src/assets/home/`** under the names above and commit:

```bash
git add src/assets/home/hero-road.jpg src/assets/home/rides-kiz-kulesi.jpg src/assets/home/who-terrace.jpg src/assets/home/closing-breakfast.jpg docs/superpowers/specs/2026-11-13-home-content-design.md docs/superpowers/plans/2026-11-13-home-content.md
git commit -m "feat(home): consented club photos for the home page (cropped, name patch blurred, no metadata)"
```

---

### Task 2: Messages, parity test, hero and stats

**Files:**
- Create: `src/app/messages-parity.test.ts`
- Create: `src/components/home/home-apply-button.tsx`, `src/components/home/home-hero.tsx`,
  `src/components/home/home-stats.tsx`
- Modify: `messages/tr.json` (`Home`, `Metadata.description`), `messages/en.json` (same)
- Modify: `src/app/[locale]/page.tsx` (render `HomeHero` + `HomeStats` + JSON-LD script; drop the old hero)
- Modify: `scripts/e2e/apply-nav-e2e.mjs:52-53` (hero anchor)

**Interfaces:**
- Consumes: `src/assets/home/hero-road.jpg` (Task 1); `ClubBadge` (`sizes` must match its CSS width);
  `HeroApplyGuess`, `HeroApplyForUser` (unchanged).
- Produces:
  - `HomeApplyButton({ className }: { className?: string })` — `<Suspense fallback={<HeroApplyGuess …>}>` +
    `<HeroApplyForUser …>`, label `t("apply")`, `buttonVariants({ size: "lg" })` merged with `className`. Used by the
    hero and (Task 3) the closing section.
  - `HomeHero()` — `<section data-home-hero className="dark …">`; `HomeStats()`.
  - Message keys (Task 3 adds its own under the same `Home` namespace): `Home.eyebrow`, `Home.title`,
    `Home.subtitle`, `Home.apply`, `Home.heroAlt`, `Home.stats.{membersValue,membersLabel,ridesValue,ridesLabel,
    sidesValue,sidesLabel}`. `Home.events` is **removed** (dead once the hero loses the events button).

- [ ] **Step 1: Write the parity test** `src/app/messages-parity.test.ts` (`node --test`, import the JSON files with
  `with { type: "json" }` and relative paths). Test `"en.json and tr.json have the same message keys"`: flatten both
  objects to dotted key paths; `assert.deepEqual(sortedEnKeys, sortedTrKeys)`.
- [ ] **Step 2: Run it** — `pnpm test`. Expected: PASS on today's files (if it FAILS, the diff lists existing gaps:
  fix them in this task and mention them in the commit).
- [ ] **Step 3: Update messages.** Turkish from the spec (§1 hero, §2 stats, Metadata). English, verbatim:

| Key | English |
|---|---|
| `Home.eyebrow` | Istanbul Motorcycle Club |
| `Home.title` | Let's ride together. |
| `Home.subtitle` | Weekend rides, long tours and new friendships. Meet riders from every side of Istanbul, from Asia to Europe. |
| `Home.apply` | Apply to join |
| `Home.heroAlt` | Club members taking a break on a coastal road, helmets on, the sea behind them |
| `Home.stats.*` | `140+` / members · `Every week` / rides · `Both sides` / Asia and Europe |
| `Metadata.description` | Istanbul's motorcycle club. Weekend rides, long tours and new friendships, open to every rider over 18. Apply to join. |

  Turkish `Home.heroAlt`: "Deniz kenarındaki bir yolda mola veren, kasklı kulüp üyeleri". Delete `Home.events` in both.
- [ ] **Step 4: Run** `pnpm test` (parity PASS) — `pnpm exec tsc --noEmit` now FAILS on `t("events")` in `page.tsx`
  (expected until step 5).
- [ ] **Step 5: Implement `HomeApplyButton`, `HomeHero`, `HomeStats`; rewrite `page.tsx`.**
  - Hero: full-bleed (`relative` section, no horizontal padding on the photo), `next/image` with `src` = static import,
    `fill`, `sizes="100vw"`, `placeholder="blur"`, `preload`, `className="object-cover object-[38%_50%] md:object-[50%_40%]"`;
    height ≈ `h-[560px] md:h-[720px]`; gradient overlay (phone: transparent → `bg-background` at the bottom; desktop:
    additionally dark on the left behind the text, as in the mockup `docs/design/mockups/home-content-a-v3.html`); text
    block bottom-left inside the usual `max-w-5xl` gutter: `ClubBadge` (~`w-16 md:w-21`, matching `sizes`, **no**
    `preload` — the photo is the LCP), `eyebrow`, `h1.heading`, subtitle `text-muted-foreground`, `HomeApplyButton`.
    `alt={t("heroAlt")}`.
  - Stats: three cards in a row (`grid grid-cols-3`), value in `text-accent-text`, label muted; inside `max-w-5xl`.
  - `page.tsx` keeps `generateMetadata` unchanged and the JSON-LD `<script>` (now after the sections).
  - `apply-nav-e2e.mjs`: replace `heroEvents` (`main a[href$="/events"]`) with the visible `main [data-home-hero]`,
    rename the variable to `hero` and update the comment above `frameLogger` ("the hero" instead of the events link).
- [ ] **Step 6: Verify** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; in the build output
  `/[locale]` is still prerendered (same symbol as before the change on `main`).
- [ ] **Step 7: Look at it** — `pnpm start -p 3123`, puppeteer screenshots (scratchpad) of `/` and `/en` at 390×844
  and 1280×800, dark and light (set `localStorage.theme` before load, see `src/lib/theme.ts`): hero text cream in both
  themes, crop shows the group and the sea, badge sharp. Stop the server with the `kill $(ss -ltnp …)` line from
  CLAUDE.md.
- [ ] **Step 8: Commit**

```bash
git add src/app/messages-parity.test.ts src/components/home/home-apply-button.tsx src/components/home/home-hero.tsx src/components/home/home-stats.tsx messages/tr.json messages/en.json "src/app/[locale]/page.tsx" scripts/e2e/apply-nav-e2e.mjs
git commit -m "feat(home): photo hero and stats; message parity test"
```

---

### Task 3: Sections — rides, who can join, how to join, rules, FAQ, closing

**Files:**
- Create: `src/components/home/photo-section.tsx`, `src/components/home/home-rides.tsx`,
  `src/components/home/home-who.tsx`, `src/components/home/home-join.tsx`, `src/components/home/home-faq.tsx`,
  `src/components/home/home-closing.tsx`
- Modify: `messages/tr.json`, `messages/en.json` (new `Home.*` keys), `src/app/[locale]/page.tsx` (render them)

**Interfaces:**
- Consumes: `HomeApplyButton` (Task 2); `src/assets/home/{rides-kiz-kulesi,who-terrace,closing-breakfast}.jpg`.
- Produces: `PhotoSection({ eyebrow, title, photo, alt, photoSide, children }: { eyebrow: string; title: string;
  photo: StaticImageData; alt: string; photoSide: "left" | "right"; children: ReactNode })` — phone: eyebrow, `h2`,
  children, photo (rounded, full width) stacked; `md:` two columns, photo on `photoSide`; `sizes="(min-width: 768px)
  50vw, 100vw"`, `placeholder="blur"`. Used by `HomeRides` (photo right) and `HomeWho` (photo left).
  Message keys: `Home.rides.{eyebrow,title,weekend,weekday,district1..4,alt}`, `Home.who.{eyebrow,title,body,
  conditions,alt}`, `Home.join.{eyebrow,title,step1Title,step1Body,…,step4Title,step4Body}`, `Home.rules.{title,body,
  motto}`, `Home.faq.{title,q1,a1,q2,a2,q3,a3}`, `Home.closing.{line,alt}`.

- [ ] **Step 1: Add the messages.** Turkish from the spec §3–§8 (alts as written there; in the rides `weekday` line the
  districts are separate chips, not part of the sentence). English, verbatim:

| Key | English |
|---|---|
| `rides.eyebrow` / `rides.title` | Rides / On the road at weekends, together on weekdays |
| `rides.weekend` | When the weather allows, we ride as a group every weekend: Şile, Ağva, Riva, Polonezköy and the scenic roads around Istanbul. Depending on the route a ride takes half a day or a full day, and now and then we plan tours of several days. |
| `rides.weekday` | On weekdays, members who live nearby meet at a café to catch up, usually by the sea. |
| `rides.district1..4` | Beşiktaş · Üsküdar · Kadıköy · Beykoz |
| `rides.alt` | Club members at night on the Üsküdar shore, the Maiden's Tower behind them |
| `who.eyebrow` / `who.title` | Who can join / Anyone over 18 |
| `who.body` | Any bike from 50cc to 1000cc, any licence. New riders, women riders and pillion passengers without a bike of their own ride with us too. |
| `who.conditions` | Some events may have conditions, such as a bike class. |
| `who.alt` | Group photo on a café terrace during a ride break |
| `join.eyebrow` / `join.title` | How to join / From application to the main group |
| steps 1–4 | Apply — Fill in the form; it takes a few minutes. · Approval — The club team reviews your application. · Getting to know each other — For a few days we get to know each other in a separate group. · Main group — You're family now. |
| `rules.title` | Our riding rules |
| `rules.body` | Helmets are mandatory; we recommend a jacket, gloves and boots. We keep the convoy in order: a safe distance and no overtaking without the go-ahead. We follow the traffic rules and treat each other with respect. |
| `rules.motto` | We're not here to go fast: we leave together and we come back together. |
| `faq.title` | Frequently asked questions |
| q1 / a1 | I don't have a motorcycle. Can I join? / Yes, as a pillion passenger. |
| q2 / a2 | I'm a new rider. Is that a problem? / No. The convoy rides at a pace that suits everyone; nobody gets left behind. |
| q3 / a3 | Can I join rides without being a member? / Rides are for members. Apply; once you're approved, you can join some rides while you're in the getting-to-know group. |
| `closing.line` | A family of people who share the same road. |
| `closing.alt` | Club members at a long breakfast table in Kanlıca |

- [ ] **Step 2: Run** `pnpm test` — parity PASS.
- [ ] **Step 3: Implement the components** (Server Components with `useTranslations`), page order: hero, stats, rides,
  who, join, FAQ, closing.
  - `HomeRides`: two paragraphs + district chips (small rounded-full bordered spans, muted text).
  - `HomeJoin`: an `ol` of the four steps (number badges `bg-primary text-primary-foreground`) and the rules card
    (`bg-card border rounded-xl`, motto in bold); phone stacked, `md:` side by side.
  - `HomeFaq`: `h2` + `dl` (`dt` question bold, `dd` answer muted), `max-w-[720px]`, rows separated by `border-t`.
  - `HomeClosing`: full-width photo band (`h-[220px] md:h-[420px]`, `object-cover`, `sizes="100vw"`, blur), then the
    centred line (`heading`-free, `text-xl md:text-3xl font-extrabold`) and `HomeApplyButton`. When the button renders
    nothing (members), the section must still end with normal bottom padding.
  - Section rhythm: `pt-7 md:pt-18` between sections, content inside `mx-auto max-w-5xl px-4`.
- [ ] **Step 4: Verify** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; `/[locale]` still
  prerendered.
- [ ] **Step 5: Run the apply-nav E2E** against `pnpm start -p 3123` (fixture setup per `scripts/e2e/README.md`):
  `PUPPETEER_DIR=~/e2e-tools node scripts/e2e/apply-nav-e2e.mjs` — all PASS (the hero check now covers both Başvur
  buttons).
- [ ] **Step 6: Look at it** — screenshots (scratchpad) of `/` and `/en`: 390 and 1280, dark and light, signed out and
  as `member@test.local` (Başvur hidden: hero and closing still look finished); `/en` at 360×780 with
  `document.documentElement.scrollWidth === window.innerWidth` (no horizontal overflow). Compare against the mockup.
- [ ] **Step 7: Commit**

```bash
git add src/components/home/photo-section.tsx src/components/home/home-rides.tsx src/components/home/home-who.tsx src/components/home/home-join.tsx src/components/home/home-faq.tsx src/components/home/home-closing.tsx messages/tr.json messages/en.json "src/app/[locale]/page.tsx"
git commit -m "feat(home): rides, who can join, how to join, rules, FAQ and closing sections"
```

---

### Task 4: Privacy notice — photos on the public website

**Files:**
- Modify: `src/app/[locale]/privacy/content-tr.tsx` (§2 line 25, §3 after line 35, §4 after line 44, §6 line 83)
- Modify: `src/app/[locale]/privacy/content-en.tsx` (matching lines: 39, 48, 87 and the §2 "Visual data" bullet)
- Modify: `src/lib/applications/options.ts:57` (`PRIVACY_NOTICE_VERSION` → `"2026-11-13-draft-5"`)

**Interfaces:** none.

- [ ] **Step 1: Edit the Turkish notice** ("siz" register), verbatim:
  - §2 "Görsel veriler": append "; ayrıca buna açıkça izin verdiyseniz, kulübün herkese açık internet sitesinde
    yayınlanan ve sizi gösteren sürüş ve buluşma fotoğrafları." (replacing the final period).
  - §3 new bullet after the gallery one: "Açık rızanız varsa, kulübü tanıtmak için sürüş ve buluşma fotoğraflarını
    herkese açık internet sitemizde yayınlamak,"
  - §4 new bullet after the gallery one: "Fotoğraflarınızın herkese açık internet sitemizde yayınlanması için ayrıca
    verdiğiniz açık rıza (KVKK m.5/1). Bu rızayı istediğiniz zaman 9. bölümdeki yöntemle bize yazarak geri
    alabilirsiniz; fotoğraf siteden kaldırılır."
  - §6 replace the photo bullet: "Fotoğraflar: galerideki fotoğraflar açık rızanızı geri aldığınızda galeriden,
    internet sitemizdeki fotoğraflar bu rızayı geri aldığınızda siteden kaldırılır."
- [ ] **Step 2: Mirror in English** with the same meaning (section 9 = "How to apply"/contact section; keep the
  notice's existing English terms, e.g. "explicit consent", "KVKK art. 5/1").
- [ ] **Step 3: Bump `PRIVACY_NOTICE_VERSION`** to `"2026-11-13-draft-5"` (draft-4 is deployed).
- [ ] **Step 4: Verify** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; open `/privacy` and
  `/en/privacy` once (screenshots) to confirm the bullets render.
- [ ] **Step 5: Commit**

```bash
git add "src/app/[locale]/privacy/content-tr.tsx" "src/app/[locale]/privacy/content-en.tsx" src/lib/applications/options.ts
git commit -m "feat(privacy): cover photos on the public website (notice draft-5)"
```

---

### Task 5: Docs — removal procedure, content record, follow-ups, learnings

**Files:**
- Modify: `CLAUDE.md` (Production section, after "Deleting an account")
- Modify: `docs/content/home-page-questions.md` (new section "Published (2026-11-13)")
- Modify: `docs/follow-ups.md`, `docs/PLAN.md` (only if it describes the home page; `grep -n -i "home" docs/PLAN.md`)
- Modify: `docs/learnings/<topic>.md` + `docs/learnings/README.md` index for anything non-obvious found in Tasks 1–4

**Interfaces:** none.

- [ ] **Step 1: Check Vercel Deployment Protection** — `vercel ls ridevibe-app 2>&1` → take an older production
  deployment URL (`*.vercel.app`) and `curl -sI <url>`: 401 / redirect to vercel.com login = protected; 200 = public.
  Record the outcome (and the date) in step 2.
- [ ] **Step 2: Add "Removing a website photo" to CLAUDE.md** (≤ 8 lines, Production section): when someone withdraws
  consent → (1) remove/replace the file in `src/assets/home/` and its use, merge, deploy; (2) purge it from history:
  `git filter-repo --path src/assets/home/<file> --invert-paths`, force-push `main` (one-off exception to the
  merge-only rule, iltan approves; other clones re-clone); (3) old Vercel deployments: per the step 1 outcome (delete
  every deployment since the photo was added, or "protected behind Vercel Authentication, no action"); (4) Search
  Console → "Remove outdated content" for the old image URL; (5) originals and unused photos never enter the repo.
  Consent proof (the WhatsApp message) is kept by the club, outside the repo.
- [ ] **Step 3: Record the published state** in `docs/content/home-page-questions.md`: which four photos are used
  (file names in `src/assets/home/`, source WhatsApp names), consent basis (written group agreement for the website,
  2026-11-13), iltan's copy rules (no ücretsiz / kahve(de) / sohbet / payment talk), "140+" updated by hand.
- [ ] **Step 4: Update `docs/follow-ups.md`** — remove the "SEO round 2: home content" Next-up item; add (dated
  2026-11-13, origin "home content"): **Update "140+" by hand** as the club grows (`Home.stats.membersValue`);
  **"Etkinlikleri Gör" back in the hero** when Events has content; **Gallery candidates** (Glob Coffee and small-café
  photos, not committed; the small-café one needs the stranger cropped); **Home photos are 1600 px** (soft on very
  wide screens; ask for originals if it bothers); plus anything parked in the reviews.
- [ ] **Step 5: Learnings** — add an entry for each non-obvious discovery (symptom → cause → do), e.g. the `dark`
  class scoping a section to the night palette, `next/image` preload vs. the badge, crop/blur with sharp. Skip if
  nothing was surprising.
- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/content/home-page-questions.md docs/follow-ups.md docs/learnings
git commit -m "docs: home content — photo removal procedure, published state, follow-ups, learnings"
```

---

### Task 6: Verification before review (main session)

- [ ] **Step 1: Full checks** — `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build`; build output shows
  `/[locale]` prerendered as on `main`.
- [ ] **Step 2: Server HTML** — `pnpm start -p 3123`; `curl -s localhost:3123/ | grep -c "Sık sorulanlar"` ≥ 1, the
  three FAQ answers and "Hafta sonu yolda" present; same for `/en` ("Frequently asked questions"). No `ücretsiz`,
  `kahvede`, `sohbet` in `messages/tr.json` (`grep -n -i`).
- [ ] **Step 3: Loading** — puppeteer, 390×844, Fast-4G throttling (`throttle` from `scripts/e2e/e2e-lib.mjs`):
  the hero image is requested with a `<link rel="preload">` (or `fetchpriority="high"`), its served width ≤ 828 px on
  the phone, and a `PerformanceObserver` for `layout-shift` reports 0 from image loads; LCP element is the hero image.
- [ ] **Step 4: E2E** — `seo-check.mjs` locally (PASS); `apply-nav-e2e.mjs` (PASS); `nav-e2e.mjs` and
  `header-e2e.mjs` (they load `/`; PASS).
- [ ] **Step 5:** Then `superpowers:requesting-code-review`, iltan reviews, `--no-ff` merge, push `main`, wait for the
  deploy (`vercel ls …` newest row Ready), `BASE=https://ridevibe.com.tr node scripts/e2e/seo-check.mjs`, and iltan
  requests re-indexing of `/` in Search Console.
