# Design system: "Gece + turkuaz" — design spec

Date: 2026-11-09 · Branch: `feat/design-system` · Status: draft for review (iltan)

## Goal

Give Ride & Vibe its own visual identity before the MVP screens (Members, Events, Announcements) are built, so new
screens are built in the final style. Apply it to every existing page. No new features.

Success = every existing page looks like the chosen mockup (`docs/design/mockups/chosen-gece-turkuaz.png`, variant
"2 · Gece + turkuaz" and "Açık tema") on a 390 px phone, in dark and light, with Turkish text rendering correctly and
text/button contrast meeting WCAG AA.

## Decisions (with who decided)

- **Direction:** "Gece + turkuaz" — B's structure and font (Saira, condensed uppercase headings, sporty layout),
  colours taken from the club's existing WhatsApp logo: night background, **sunset orange for actions**, **cream for
  text**, **teal for statuses**. (Samet picked B; iltan picked the teal-status variant, 2026-11-09.)
- **Logo:** keep the existing WhatsApp badge as the **primary logo** (Samet). The site derives small marks from it:
  its own brush lettering as the **wordmark**, and "R&V" cut from that lettering as the **app icon** (iltan approved,
  2026-11-09). The WhatsApp group photo gets replaced manually with the AI-upscaled badge (no other change).
- **Theme:** dark by default; a switch with **Sistem / Koyu / Açık** (system = follow the phone), remembered on the
  device (iltan, 2026-11-09).
- **Fallbacks kept for later switching** (no work now): "1 · Gece" (orange only, no teal), direction A (Far, amber +
  Archivo Expanded), C (İki Far, amber + teal + Sora). Mockups and values in `docs/design/`.
- **Audience note:** mixed club (18–45, all genders, 50 cc scooters to choppers) → no macho styling, no bike-type
  silhouettes in UI chrome.

## 1. Colour tokens

Defined as CSS variables in `src/app/globals.css` (`:root` = light, `.dark` = dark), mapped to the existing shadcn
token names so all `src/components/ui/*` components and existing pages pick them up without per-component changes.
Values are hex here for review; implementation may convert to `oklch()` (same colour).

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--background` | `#0B0D10` | `#FBF5E5` | page |
| `--foreground` | `#FBF5E5` | `#14120F` | text |
| `--card` / `--popover` | `#14171C` | `#FFFDF7` | cards, menus, tab bar |
| `--secondary` / `--muted` | `#1E2229` | `#F1E9D6` | date block, chips, progress track |
| `--muted-foreground` | `#A39C8C` | `#6B6352` | secondary text |
| `--border` | `#22272F` | `#E6DCC5` | dividers, card borders |
| `--input` | `#3A3F48` | `#CDBF9F` | input / outline-button borders |
| `--primary` | `#F98D2F` | `#F98D2F` | main buttons, active tab |
| `--primary-foreground` | `#1A0E02` | `#1A0E02` | text on orange |
| `--accent-text` (new) | `#FBA04A` | `#B4560C` | orange *text* (eyebrows, links); plain orange fails AA on cream |
| `--ring` | `#F98D2F` | `#E2741A` | focus ring |
| `--status` (new) | `#2FD8BE` | `#0E9F88` | progress fill, positive states (approved, active, going) |
| `--status-muted` (new) | `#0E2C28` | `#DDF5F0` | status pill background |
| `--status-foreground` (new) | `#4FE6CE` | `#0B6E5F` | status pill text |
| `--sun` (new) | `#FBE563` | `#F2C230` | rare highlight (hero glow); not for text |
| `--destructive` | keep shadcn red, re-check contrast on both backgrounds | | errors, reject |

- `--accent` (shadcn's hover background) = `--secondary` values; `--accent-foreground` = `--foreground`.
- New tokens are exposed to Tailwind via `@theme inline` (`bg-status`, `text-status-foreground`, `text-accent-text`…).
- Sidebar/chart tokens: set to the same palette (unused today, keep them consistent).
- Light theme's teal values come from direction B's light palette (the "Açık tema" mockup shows orange pills; the
  chosen variant uses teal pills in light too).
- **Contrast check** (part of verification): body text, muted text, accent text, button text and status pill text
  against their backgrounds in both themes, WCAG AA (4.5:1 normal text, 3:1 large text/UI). Adjust values if a pair
  fails; record final values here.

## 2. Typography

- **Saira** (variable, `wght` + `wdth` axes) via `next/font/google`, subsets `latin` + `latin-ext` (Turkish ğ ş ı İ),
  replacing Geist. `next/font` self-hosts the files at build time → no request to Google from visitors (KVKK: no IP
  leak). Mono font: keep Geist Mono (used rarely) or drop if unused — decide in the plan after a grep.
- **Body:** Saira, normal width (`wdth` 100), weights 400/600/700.
- **Headings / section titles / wordmark-like labels:** Saira condensed (`font-stretch: 80%`), weight 800, uppercase,
  slight positive tracking. Provided as a utility/variant (e.g. `font-heading` + a `heading` class) so pages don't
  repeat the recipe.
- **Eyebrows:** 10–11 px, weight 600, uppercase, `letter-spacing: .14em`, `--accent-text`.

### Dotted-İ rule

CSS `text-transform: uppercase` follows the element's `lang`. On Turkish pages `i → İ`, so English words become
"RİDE & VİBE" (seen in the mockups). Turkish text uppercased this way is **correct** ("BİRLİKTE SÜRELİM").
- Never CSS-uppercase English/brand words on a `tr` page; the brand appears as the wordmark image/SVG, or put
  `lang="en"` on the element.
- Add to `docs/learnings/ui.md` and a one-liner in CLAUDE.md's i18n section.

## 3. Light / dark theme

- Dark is the default for everyone; the user can pick **Sistem / Koyu / Açık**; choice stored on the device.
- Must not make pages dynamic (Cache Components): no theme cookie read on the server. The theme class is applied on
  the client before paint (inline script in `<head>`), so there's no flash of the wrong theme.
- Candidate: `next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem`). **The plan must verify** its
  compatibility with Next 16 + React 19 + Cache Components (script-in-head warnings, `suppressHydrationWarning` on
  `<html>`); fall back to a ~20-line own inline script + small client hook if it doesn't fit.
- **Switch location:** in the user menu dropdown (signed-in) **and** reachable when signed out (the header is the same
  for everyone; place it next to the locale switcher or inside a small "settings" menu — decided in the plan by
  looking at the header at 390 px). Labels via next-intl (`Theme.system` / `Theme.dark` / `Theme.light`).
- `viewport.themeColor` follows the theme: `#0B0D10` dark, `#FBF5E5` light (browser bar colour on phones).

## 4. Logo & brand assets

Sources live in `docs/design/brand/` (committed); production files in `public/brand/` and Next.js file conventions.

| Asset | Source | Production form | Used in |
|---|---|---|---|
| Badge (primary logo) | `badge-2048.png` (Real-ESRGAN 4× of the WhatsApp JPEG, background removed) | WebP/AVIF via `next/image` from a 1024 px file | home hero, sign-in, OG image |
| Wordmark | `wordmark-cream-master.png` (brush lettering cut from the badge) | **single-colour SVG** traced from the master (`fill="currentColor"`), as a React component | header, footer |
| App icon "R&V" | `monogram-cream-master.png` | `src/app/icon.png` (+ sizes), `apple-icon.png`, `favicon.ico`, PWA manifest icons (incl. maskable) — cream on night | browser tab, home screen |
| Link preview | badge on night background + "Ride & Vibe" | `src/app/[locale]/opengraph-image` (static PNG or generated) | WhatsApp/social link previews |

- Tracing: use a vectoriser (e.g. potrace via an npm package) in a one-off script kept in the scratchpad, commit only
  the resulting SVG; check it visually against the master at header size and large.
- The "R&V" V was cut where it touches the next letter; refine that edge before generating icons.
- Print master (4665 px, 21 MB) is **not** committed — iltan keeps it (exports folder → Google Drive).
- Quality limit (documented, not solved here): the upscale can't add detail the 1267 px original lacks. Fine for web,
  stickers, prints up to ~39 cm. Large back patches/embroidery need a designer's vector redraw later; then only the
  files in `public/brand/` change.

## 5. Applying it to existing screens

Mostly automatic through tokens; targeted changes:
- **Header** (`site-header.tsx`): wordmark component instead of text title; theme switch (see §3).
- **Bottom tab bar** (`bottom-nav.tsx`): card background, active item in primary orange; desktop nav same accents.
- **Footer:** small wordmark, muted text.
- **Home** (`[locale]/page.tsx`): badge (~118 px) above the eyebrow, condensed uppercase title, soft orange glow
  behind the badge, primary + outline buttons as in the mockup.
- **Sign-in:** badge centred above the Google button.
- **Apply form, account, privacy, 404, coming-soon pages, admin (applications, members, roles):** token pass only;
  fix anything that hard-codes neutral colours; status badges (approved/active) use the status colours.
- Buttons: radius 6 px (B's squarer, sportier corners) — set via `--radius` so cards/inputs scale with it.

## 6. Route styling (specified now, built in Events)

Events have a **route**, not a single meeting point (iltan, 2026-11-09 → add to `docs/PLAN.md` Events requirements).
Visual language for the Events iteration:
- Route line: `--primary` orange, 3 px, round caps, with a soft 6 px glow (25 % opacity) underneath.
- Start: ring (cream/foreground stroke, background fill). Stops: small filled foreground dots. Finish: filled orange
  dot with a background-coloured outline.
- Map base colours — dark: land `#11151A`, roads `#1F252D`, sea `#0E1820`, labels `#7E8794`; light: land `#EFE6D2`,
  roads `#E0D4BA`, sea `#D9E3E4`, labels `#8C836F`, route `#E2741A`.
- Event card: route preview strip on top (~96 px), then date block, title, "08:30 · Üsküdar → Ağva · 140 km", capacity
  bar (status colour) and status pill.
- Map technology and how organisers enter routes (GPX / Google Maps link / drawing) are decided in the Events spec.

## 7. Docs & housekeeping (same branch)

- `docs/design/README.md`: chosen direction, token table pointer, fallbacks (how to switch = swap the token values),
  asset provenance (WhatsApp JPEG → Real-ESRGAN `realesrgan-x4plus` → mask), the Turkish brief for Samet.
- `docs/PLAN.md`: replace "Design pass needed" with the decision summary + link to this spec; add the route
  requirement to Events; note the WhatsApp group photo swap.
- Learnings: `ui.md` (dotted İ), `environment.md` (running Windows GPU tools like Real-ESRGAN from WSL; headless
  Chrome for PNG/PDF exports and one-page PDFs).
- `.gitignore`: `.superpowers/` (already added).

## 8. Testing / verification

- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- Unit test for any pure helper added (e.g. theme value parsing if we write our own script).
- Browser E2E at 390 px and desktop, **both themes and "Sistem"**, every page in §5, TR and EN: no flash of wrong
  theme on reload, theme persists, wordmark/badge/icons render, Turkish characters correct, no "RİDE".
- Contrast check from §1; Lighthouse/axe quick pass on home and apply form.
- `pnpm build` must stay free of new dynamic-rendering errors (theme must not read cookies/headers).

## Out of scope

New features, page re-layouts beyond styling, the map, a designer redraw of the logo, automatic WhatsApp changes,
changing the badge's "ADVENTURE RIDE" tagline.
