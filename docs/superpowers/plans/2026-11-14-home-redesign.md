# Home redesign "Rota + 34" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the home page into the approved "Rota + 34" design — a turquoise route line from a "34 RV 2026" plate
through the page, huge condensed type, no template chrome — and remove every age mention.

**Architecture:** Same Server Components in `src/components/home/`, restyled; two new primitives (`Route` /
`RouteStop` for the line and its stops, `LicensePlate`); copy in `messages/{tr,en}.json` (`Home.*`). Hero and closing
are always dark (`dark` class); the route sections follow the theme. Only `HomeApplyButton` reads the session.

**Tech Stack:** Next.js 16 (Cache Components), next-intl 4, Tailwind CSS 4, Saira variable font (width + weight),
`next/image` static imports, puppeteer E2E scripts.

**Spec:** `docs/superpowers/specs/2026-11-14-home-redesign-design.md` (approved 2026-11-14). Layout reference:
`docs/design/mockups/home-rota-34.html` (dark, phone + desktop) and `home-rota-34-light.html` (light). The spec's copy
table is the source of truth for text; the mockups are layout only.

## Global Constraints

- Branch `feat/home-redesign`; Conventional Commits; stage by path; never stage `.claude/settings.json`; **no
  `Co-Authored-By` or other trailer**. Before every code commit: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`,
  `pnpm build` pass and `/[locale]` stays ◐ (partially prerendered).
- Copy: the spec's "Copy changes" table verbatim (TR and EN); all other `Home.*` strings unchanged. No age anywhere
  ("18", "yaşını geçen", "over 18") on the page or in `Metadata.description`.
- Never "ücretsiz", "kahve(de)", "sohbet", payment talk. No hard-coded UI strings; TR/EN key parity
  (`src/app/messages-parity.test.ts`).
- No eyebrow labels, no CSS `uppercase`, no stat cards, no bordered/rounded content cards, no `heading`/`eyebrow`
  utilities on the home page. Saira only; display headings sentence case, condensed via `font-stretch` (~62% h1, ~70%
  h2), weight 800, leading ~0.86–0.95 without clipping Turkish diacritics (İ, Ş, Ğ, Ü).
- Colours: existing tokens only. Route line/dots: `bg-status-foreground dark:bg-status` (and matching borders); "Ana
  grup" dot `bg-primary`; motto `text-accent-text`; buttons: existing primary button via `HomeApplyButton`.
- Hero (`data-home-hero`) and closing (`data-home-closing`) carry the `dark` class; keep both `data-` attributes (E2E
  anchors) and `HomeApplyButton` unchanged.
- Images: the four files in `src/assets/home/` via static import, `placeholder="blur"`, hero `preload`, honest `sizes`;
  alt texts unchanged.
- Mobile-first (390px), desktop at `md:`/`lg:`; links from `@/i18n/navigation`. No motion.
- Remove dead code in the same change (`home-stats.tsx`, unused keys, `photo-section.tsx` if no longer used).

## Review Focus

1. **Member view** (both Başvur buttons render nothing): hero and closing must still end cleanly — Task 2 step 6
   screenshots as `member@test.local` via `apply-nav-e2e` fixtures or a signed-in screenshot.
2. **Light theme**: straight hero edge with the plate across it; line/dots in `status-foreground` with ≥ 3:1 against
   cream; closing stays dark — Task 1 step 6 and Task 2 step 6 screenshot both themes.
3. **English and narrow phones**: longer EN strings and the ruler labels at 320px must not overflow — Task 2 step 6
   checks `scrollWidth <= innerWidth` on `/en` at 320×568.
4. **Turkish diacritics under tight leading**: "Şile", "Ağva", "Birlikte sürelim", "Her yaştan" must not clip or
   collide — Task 1 step 6 / Task 2 step 6 zoomed screenshots.
5. **Large text** (OS font scaling): the hero grows instead of clipping (min-height) — Task 1 step 6 with
   `document.documentElement.style.fontSize = "24px"`.

---

### Task 1: Route primitives, plate, hero and rides

**Files:**
- Create: `src/components/home/route.tsx`, `src/components/home/license-plate.tsx`
- Modify: `src/components/home/home-hero.tsx`, `src/components/home/home-rides.tsx`, `src/app/[locale]/page.tsx`,
  `messages/tr.json`, `messages/en.json`
- Delete: `src/components/home/home-stats.tsx`

**Interfaces:**
- Consumes: `HomeApplyButton({ className })`; photos `hero-road.jpg`, `rides-kiz-kulesi.jpg`.
- Produces (Task 2 uses these):
  - `Route({ children }: { children: ReactNode })` — wrapper that draws the vertical line in the left gutter
    (phone: line ~27px from the left edge, content starts ~58px; desktop: line in the gutter of the usual max-width
    container) and exposes the geometry as CSS custom properties so stops and full-bleed photos can align to it.
  - `RouteStop({ kind = "section", as = "div", className, children }: { kind?: "section" | "place" | "step" | "last";
    as?: "div" | "li"; className?: string; children: ReactNode })` — content with its dot on the line: `section` and
    `step` = hollow ring (~15px, 3px border), `place` = small filled dot (~11px), `last` = larger orange dot (~19px,
    `bg-primary`). On desktop two-column rows the stop goes on the row wrapper so the dot lands on the line at the
    heading's height.
  - `RoutePhoto({ src, alt, className, sizes }: { src: StaticImageData; alt: string; className?: string; sizes:
    string })` — phone: full-bleed photo with the line drawn over it; desktop: a normal column image.
  - `LicensePlate()` — the decorative "34 RV 2026" plate (`aria-hidden`), HTML/CSS only.
  - Page order in `page.tsx`: `HomeHero`, `LicensePlate`, `Route` (containing rides, who, join, FAQ), `HomeClosing`,
    then the JSON-LD script.

- [ ] **Step 1: Messages.** Apply the spec's copy table rows for `rides.weekend`, `rides.weekday` (ends with ":"),
  new `rides.place1..4` (Şile, Ağva, Riva, Polonezköy — same in EN) and `Metadata.description` (TR + EN verbatim).
  Remove `Home.eyebrow`, `Home.stats` (whole object), `Home.rides.eyebrow`.
- [ ] **Step 2: Run** `pnpm test` → parity PASS; `pnpm exec tsc --noEmit` FAILS on the removed keys
  (`home-stats.tsx`, hero eyebrow, rides eyebrow) — expected until step 3.
- [ ] **Step 3: Implement** `route.tsx`, `license-plate.tsx`; restyle `HomeHero` (no badge, no eyebrow; `min-h`
  ~640px phone / ~760px desktop, flex column `justify-end`; h1 two lines "Birlikte / sürelim." very large; gradient to
  the night background at the bottom on phones, left-dark + bottom on desktop; subtitle; `HomeApplyButton`) and
  `HomeRides` (h2, weekend text, the four places as `RouteStop kind="place"` in large condensed type, `RoutePhoto` with
  Kız Kulesi, weekday text followed by `district1..4` joined with ", " and a final "."). Plate overlaps the hero's
  bottom edge (negative top margin, above the hero in z-order), left-aligned with the content; plate colours fixed in
  both themes (white plate, black border, blue "TR" strip). Delete `home-stats.tsx`; update `page.tsx` to the order
  above (who/join/FAQ still render their current markup inside `Route` until Task 2).
- [ ] **Step 4: Verify** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` — all pass, `/[locale]` ◐.
- [ ] **Step 5: E2E anchor check** — `grep -n "data-home-hero\|data-home-closing" src/components/home/*.tsx` shows
  both still present.
- [ ] **Step 6: Look at it** (`pnpm start -p 3123`, puppeteer with `PUPPETEER_DIR=~/e2e-tools`, screenshots in the
  session scratchpad): `/` and `/en` at 390×844 and 1280×800, dark and light (`localStorage.theme`); compare with the
  mockups: line starts under the plate, place dots on the line, plate across the light-theme hero edge; zoom on "Şile",
  "Ağva", "Birlikte sürelim." (no clipped diacritics); hero with `document.documentElement.style.fontSize = "24px"`
  grows instead of clipping. Stop the server with the CLAUDE.md `kill $(ss -ltnp …)` line.
- [ ] **Step 7: Commit**

```bash
git add src/components/home/route.tsx src/components/home/license-plate.tsx src/components/home/home-hero.tsx src/components/home/home-rides.tsx src/components/home/home-stats.tsx "src/app/[locale]/page.tsx" messages/tr.json messages/en.json
git commit -m "feat(home): route line, 34 plate, new hero and rides; drop stats row"
```

---

### Task 2: Who can join, how to join + rules, FAQ, closing

**Files:**
- Modify: `src/components/home/home-who.tsx`, `src/components/home/home-join.tsx`, `src/components/home/home-faq.tsx`,
  `src/components/home/home-closing.tsx`, `messages/tr.json`, `messages/en.json`
- Delete: `src/components/home/photo-section.tsx` if nothing imports it any more

**Interfaces:**
- Consumes: `Route`, `RouteStop`, `RoutePhoto` (Task 1); `HomeApplyButton`; photos `who-terrace.jpg`,
  `closing-breakfast.jpg`.
- Produces: the finished page.

- [ ] **Step 1: Messages.** Spec table rows `who.title`, `who.body`, new `who.rulerLabel`, `rules.motto`, `rules.body`
  (TR + EN verbatim). Remove `who.eyebrow`, `join.eyebrow`, `rules.title`.
- [ ] **Step 2: Run** `pnpm test` → parity PASS; `tsc` FAILS on the removed keys until step 3.
- [ ] **Step 3: Implement.**
  - `HomeWho`: `RouteStop` section with h2, body, the **ruler** (`role="img"`, `aria-label={t("who.rulerLabel")}`; a
    line with six ticks labelled 50cc, 125, 250, 400, 700, 1000cc — the tick labels are part of the image, so mark
    them `aria-hidden`), conditions line, `RoutePhoto` with the terrace photo; desktop: photo left, text right.
  - `HomeJoin`: h2 "Başvurudan ana gruba", the steps as an `ol` of `RouteStop as="li"` (`step`, last one `last`);
    rules: motto as a large h2 in `text-accent-text`, then `rules.body`; desktop: steps and rules side by side.
  - `HomeFaq`: h2 + `dl`, no borders; the line ends at the bottom of the FAQ.
  - `HomeClosing`: `dark` class, `data-home-closing`; breakfast photo full width; line in large condensed type +
    `HomeApplyButton` below the photo on phones, over its darkened lower part on desktop; finished ending without the
    button.
  - Delete `photo-section.tsx` if unused (`grep -rn photo-section src`).
- [ ] **Step 4: Verify** `pnpm lint && pnpm exec tsc --noEmit && pnpm test && pnpm build` — pass, `/[locale]` ◐;
  `grep -rn -i -E "18 yaş|yaşını geçen|over 18" messages src/components/home` → no matches.
- [ ] **Step 5: E2E** against `pnpm start -p 3123` (fixtures per `scripts/e2e/README.md`; signed-in fixtures need the
  email sign-in recipe in `docs/learnings/testing.md`; delete fixture rows and restart Supabase normally afterwards):
  `apply-nav-e2e.mjs` all PASS. If the anchors' timing changed, adapt the script's frame logger, not the page.
- [ ] **Step 6: Look at it**: `/` and `/en` at 320×568, 390×844, 1280×800; dark and light; signed out and as
  `member@test.local` (no Başvur: hero and closing still end cleanly). Checks: `document.documentElement.scrollWidth <=
  innerWidth` at every size; line continuous from the plate to the end of the FAQ; every dot on the line (desktop
  two-column rows included); ruler labels readable at 320px; light theme: line/dots dark turquoise, closing dark.
  Compare with the mockups.
- [ ] **Step 7: Commit**

```bash
git add src/components/home/home-who.tsx src/components/home/home-join.tsx src/components/home/home-faq.tsx src/components/home/home-closing.tsx src/components/home/photo-section.tsx messages/tr.json messages/en.json scripts/e2e
git commit -m "feat(home): who-can-join ruler, joining steps on the route, rules, FAQ and dark closing"
```

---

### Task 3: Docs

**Files:**
- Modify: `docs/content/home-page-questions.md`, `docs/follow-ups.md`, `docs/design/README.md`, `CLAUDE.md` (only if
  a line there describes the old home layout), `docs/learnings/*` (anything non-obvious found in Tasks 1–2)

- [ ] **Step 1:** `docs/content/home-page-questions.md`: record "no age on the page" (iltan, 2026-11-14), the new
  heading "Her yaştan, her motordan", the dropped stats row and hero line, and the "Rota + 34" design (spec link).
- [ ] **Step 2:** `docs/follow-ups.md`: remove "Update 140+ by hand", the terrace-photo-height item, the
  light-theme-hero-edge item, the hero-gradient-class-strings and stats-template-key items (each resolved or gone with
  the redesign — say which in the commit message); add anything deferred in Tasks 1–2.
- [ ] **Step 3:** `docs/design/README.md`: one line — the home page's route line (turquoise, `status` /
  `status-foreground`) and the "34 RV 2026" plate are part of the brand vocabulary; mockups
  `docs/design/mockups/home-rota-34*.html`.
- [ ] **Step 4: Commit**

```bash
git add docs/content/home-page-questions.md docs/follow-ups.md docs/design/README.md docs/learnings CLAUDE.md
git commit -m "docs: home redesign — content record, follow-ups, design vocabulary"
```

---

### Task 4: Verification and rollout (main session)

- [ ] Fresh `pnpm lint`, `tsc`, `pnpm test`, `pnpm build` (◐); server HTML of `/` and `/en` contains every section's
  text and no age; `seo-check.mjs` local PASS; `nav-e2e.mjs`, `header-e2e.mjs`, `apply-nav-e2e.mjs` PASS; CLS from
  images ≈ 0 on a throttled phone.
- [ ] Whole-branch review (`superpowers:requesting-code-review`), fixes, iltan reviews, `--no-ff` merge, push `main`,
  wait for Ready, `BASE=https://ridevibe.com.tr node scripts/e2e/seo-check.mjs`.
