# Home page redesign ("Rota + 34") — design

Date: 2026-11-14 · Status: **approved by iltan (2026-11-14)** · Follows: `2026-11-13-home-content-design.md` (content,
photos, consent and privacy decisions there still hold unless changed here).

## Intent

The home page shipped on 2026-11-13 with the right content but, in iltan's words, it "looks so AI": every section is
the standard landing-page kit (orange uppercase eyebrow → big heading → grey paragraph, three stat cards, numbered
circles, bordered rounded cards, alternating text/photo, centred closing quote). iltan wants it modern and cool, not
template-like, with the same photos, brand and (mostly) the same copy.

**Done when:** `/` and `/en` show the "Rota + 34" design below at phone and desktop sizes, in both themes; the page
stays prerendered; no age requirement is mentioned anywhere on the page or in its metadata; the existing E2E, SEO and
skeleton-free loading behaviour still hold.

## Decisions (iltan, 2026-11-14)

- **Direction "A · Rota" with the "34" plate from direction B** (chosen in the browser from three directions: A Rota,
  B 34 poster, C Altyazı/cinematic). Final mockup: `docs/design/mockups/home-rota-34.html` (phone + desktop; image
  paths point to the brainstorm server, layout reference only).
- **No age on the page.** "18 yaşını geçen herkes" and the meta description's "18 yaşını geçen her motorcuya açık" go:
  they make the club sound like a group of 19-year-olds, while members range from about 18–20 to 40–45. The 18+ rule
  itself stays in the application form. New heading: **"Her yaştan, her motordan"**.
- The desktop mockup's empty space after the closing photo was a mockup artefact (CSS `transform: scale`), not part of
  the design.
- **Light theme** (shown side by side with dark, approved): hero and closing stay dark (bookends); the hero ends in a
  straight edge to the cream page and the plate straddles that edge; the route line and stop dots continue in the
  darker turquoise on cream; sections in between follow the theme. Mockup: `docs/design/mockups/home-rota-34-light.html`.

## The design

One idea carries the page: **the page is a ride.** A turquoise route line starts at a Turkish licence plate under the
hero and runs down the left side of the page, through the places the club rides to and the four steps of joining,
and ends at an orange "Ana grup" stop — "hep birlikte gidip hep birlikte dönmek" drawn as a line. Everything else
stays quiet: huge condensed type, photos, no cards, no eyebrows, no uppercase labels.

### Type and colour
- Saira only (already loaded, variable width + weight). Display headings: sentence case, condensed (`font-stretch`
  ~62% for the h1, ~70% for h2), weight 800, tight leading (~0.86–0.95; check Turkish diacritics don't collide). Body:
  normal width. No CSS `uppercase` anywhere on the home page.
- Palette: existing tokens only. Route line and stop dots: turquoise — `--status` in dark (#2FD8BE); in light the
  darker `--status-foreground` (#0B6E5F), because the bright one has too little contrast on cream (non-text contrast
  ≥ 3:1). Final "Ana grup" stop and the motto: orange (`--primary` for the dot, `text-accent-text` for the motto
  text). Buttons: existing primary button.

### Sections (phone first; desktop notes after)
1. **Hero** (always dark, `dark` class, `data-home-hero`): full-bleed coastal-road photo (~640px tall on phones,
   ~760px desktop, min-height so large text never clips), gradient to the night background at the bottom; bottom-left:
   h1 "Birlikte / sürelim." (very large, two lines), subtitle, "Kulübe Başvur" (existing `HomeApplyButton`). No badge
   and no eyebrow in the hero (the plate below and the header wordmark carry the brand).
2. **Plate**: a Turkish licence plate — white plate, black border, blue "TR" strip on the left, text **"34 RV 2026"**
   (34 = Istanbul, RV = Ride & Vibe, 2026 = founded) — overlapping the hero's bottom edge, left-aligned with the
   content. Decorative (`aria-hidden`), built in HTML/CSS (no image), plate colours fixed in both themes. The route line
   starts directly under it.
3. **Rides** (stop on the line): h2 "Hafta sonu yolda, hafta içi bir arada"; text; then the four destinations as
   stations on the line in large type (Şile, Ağva, Riva, Polonezköy); then the Kız Kulesi photo full-bleed with the
   line running over it; then the weekday line ending with the districts.
4. **Who can join** (stop): h2 "Her yaştan, her motordan"; text; a **ruler** from 50cc to 1000cc (ticks 50cc, 125, 250,
   400, 700, 1000cc; `role="img"` with an accessible label "50cc'den 1000cc'ye" / "From 50cc to 1000cc"); the conditions
   line; then the terrace photo full-bleed with the line over it.
5. **How to join**: h2 "Başvurudan ana gruba"; the four steps as stops on the line (an ordered list); the last stop
   ("Ana grup") is the larger orange dot where the line ends.
6. **Rules**: the motto as a large orange h2 "Hep birlikte gidip, hep birlikte dönmek."; the rules text below it.
7. **FAQ**: h2 "Sık sorulanlar", `dl` with the three questions. The route line runs through the rules and the FAQ and
   ends at the bottom of the FAQ (as in the mockup); the orange "Ana grup" dot marks the last joining step, not the
   end of the line.
8. **Closing** (`data-home-closing`), **always dark** (`dark` class, like the hero): breakfast photo full width; the
   line "Aynı yolu paylaşan insanlarla bir aile." in large condensed type and `HomeApplyButton` — below the photo on
   phones, over the photo's darkened lower part on desktop (as in the mockup). Members (no button) still get a
   finished ending.

**Source of truth:** the copy table below wins over any text in the mockups; the mockups are layout only.

**Desktop** (≥ md/lg): content in the usual max width with the line in the left gutter; rides and who-can-join become
two columns (text | photo, then photo | text), stop dots for those sections sit on the line at the heading's height;
steps and the rules side by side; FAQ max ~760px; hero and closing full width with text on the darker left side.

### Copy changes (Turkish source; English mirrors the meaning)
| Key | New Turkish | English |
|---|---|---|
| `who.title` | Her yaştan, her motordan | Every age, every bike |
| `who.body` | Aramızda yirmili yaşlarında olan da var, kırklı yaşlarında olan da. Her motor, her ehliyet; yeni başlayanlar, kadın sürücüler ve motoru olmayan artçılar da aramızda. | Some of us are in our twenties, some in our forties. Any bike, any licence; new riders, women riders and pillion passengers without a bike of their own ride with us too. |
| `who.rulerLabel` (new) | 50cc'den 1000cc'ye | From 50cc to 1000cc |
| `rides.weekend` | Hava uygunsa her hafta sonu toplu sürüşe çıkıyoruz. Rotaya göre yarım ya da tam gün sürüyor; ara sıra birkaç günlük turlar da planlıyoruz. | When the weather allows, we ride as a group every weekend. A ride takes half a day or a full day depending on the route, and now and then we plan tours of several days. |
| `rides.place1..4` (new) | Şile · Ağva · Riva · Polonezköy | same |
| `rides.weekday` | Hafta içi yakın oturanlarla bir kafede buluşup muhabbet ediyoruz, çoğu zaman deniz kenarında: | On weekdays, members who live nearby meet at a café to catch up, usually by the sea: |
| (districts) | followed by the existing `district1..4`, comma-separated, ending with a period | same |
| `rules.motto` | Hep birlikte gidip, hep birlikte dönmek. | We leave together and we come back together. |
| `rules.body` | Amacımız hızlı gitmek değil. Kask zorunlu; mont, eldiven ve bot öneriyoruz. Konvoy düzenini koruyoruz: güvenli mesafe, izinsiz sollama yok. Trafik kurallarına uyuyor, birbirimize saygıyla davranıyoruz. | We're not here to go fast. Helmets are mandatory; we recommend a jacket, gloves and boots. We keep the convoy in order: a safe distance and no overtaking without the go-ahead. We follow the traffic rules and treat each other with respect. |
| `Metadata.description` | İstanbul'un motosiklet kulübü. Hafta sonu sürüşleri, uzun turlar ve yeni dostluklar; her yaştan sürücüye açık. Kulübe başvur. | Istanbul's motorcycle club. Weekend rides, long tours and new friendships, open to riders of every age. Apply to join. |

**Removed keys** (dead with the new layout): `Home.eyebrow`, `Home.stats.*` (the stats row goes), `rides.eyebrow`,
`who.eyebrow`, `join.eyebrow`, `rules.title`. Everything else keeps its current text (hero title/subtitle, steps,
FAQ, closing, alts). The JSON-LD description follows `Metadata.description` automatically.

## Claude's calls (correct if wrong)
- **No stats row.** "140+ / Her hafta / İki yaka" was part of the template look; the facts are in the text. The
  follow-up "update 140+ by hand" goes with it.
- **No hero eyebrow.** "İstanbul Motosiklet Kulübü" stays in the page title, meta description and JSON-LD; the
  subtitle already says "İstanbul". Small SEO cost judged acceptable for a cleaner hero.
- **Rules title dropped**; the motto is the section heading. "Amacımız hızlı gitmek değil" (Samet's point) opens the
  rules text instead of the motto.
- **Weekend text shortened**: the destinations move out of the sentence into the stations (still real text for
  search engines).
- **No motion.** The line is static; a draw-on-scroll effect would be the "everything animates" default. Possible later.
- **Same components, restyled in place** (`src/components/home/*`, `HomeApplyButton` unchanged), so E2E anchors
  (`data-home-hero`, `data-home-closing`) and the Başvur behaviour stay; `home-stats.tsx` is deleted; `photo-section.tsx`
  is reworked or replaced if the line-over-photo layout needs it.

## Approaches considered
- **Restyle the existing home components in place — chosen.** The structure (sections, messages, photos, Başvur
  logic) is right; only the visual system changes.
- Rebuild the page from scratch as new components: nothing to gain, more churn in E2E anchors and messages.
- Keep the old layout and only swap typography/colours: wouldn't remove the template structure iltan objected to.

## Non-goals
- Other pages; the header, footer and nav; the share image; the photos and their crops; the privacy notice.
- Motion/animation; a members-only home page.

## Anti-goals
- Any eyebrow label, uppercase label, stat card, bordered card or icon grid creeping back in.
- An age mentioned anywhere on the page or in metadata.
- `/` turning dynamic; layout shift from the plate or the line; Turkish diacritics clipped by tight leading.
- The route line or plate hard to see in the light theme.

## Testing and verification
- `pnpm lint`, `tsc`, `pnpm test` (message parity), `pnpm build` (`/[locale]` stays ◐).
- `apply-nav-e2e.mjs` (Başvur on hero and closing), `nav-e2e.mjs`, `header-e2e.mjs`, `seo-check.mjs` (local, then
  production after deploy).
- Browser check at 320, 390 and 1280px, dark and light, TR and EN, signed out and as a member: no horizontal overflow,
  line continuous from the plate to the end stop, dots on the line, diacritics intact, CLS from images ≈ 0.
- `grep` the rendered HTML of `/` and `/en`: no "18 yaş" / "over 18".

## Docs
- `docs/content/home-page-questions.md`: record "no age on the page" (iltan, 2026-11-14) and the new heading.
- `docs/follow-ups.md`: remove "Update 140+ by hand", the terrace-photo-height and light-theme-hero-edge items if the
  new layout resolves them (say so), the gradient-class-strings and stats-template-key items (code gone).
- `docs/design/README.md`: one line pointing to the home page's "Rota + 34" design (route line, plate) as part of the
  brand vocabulary.

## Left to the builder
Exact sizes, spacing and gradients (match the mockup), how the line is drawn (pseudo-elements vs a wrapper), the stop
dot positions on desktop, component split inside `src/components/home/`, `sizes` attributes, English copy polish for
the new strings (iltan reviews).
