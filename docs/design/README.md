# Design system — "Gece + turkuaz"

Chosen 2026-11-09 (iltan, Samet for the logo). Full spec: `docs/superpowers/specs/2026-11-09-design-system-design.md`
(plan: `docs/superpowers/plans/2026-11-09-design-system.md`). Dark by default, light optional; sunset orange for
actions, teal for positive/status states, cream text, Saira type.

## Where things live

- **Tokens:** `src/app/globals.css` (`:root` = light, `.dark` = dark, hex values, mapped to shadcn token names +
  `accent-text`, `status*`, `sun`). Contrast-tested by `src/app/globals-contrast.test.ts` (`pnpm test`).
  Utilities `heading`, `eyebrow`.
- **Theme:** `src/lib/theme.ts` (`initTheme` / `themeInitScript`, own inline head script instead of `next-themes`),
  `src/components/theme/{theme-script,theme-switcher}.tsx`. Switcher is in the header only. Nothing is stored until
  the user picks. Why not `next-themes` (re-checked 2026-11-11): no release since 0.4.6 (March 2025), it has the open
  React 19 "Encountered a script tag" bug on a `[locale]` remount (issue #397, which we fixed in our own script), and
  it doesn't manage `meta[name=theme-color]`, which we'd need anyway. Borrowed from it instead: theme sync across tabs
  (`storage` event) and no colour transitions while the theme flips (`disableTransitionOnChange`).
- **Brand:** `src/components/brand/{wordmark,club-badge}.tsx`, `src/assets/brand/badge.png` (production badge), `public/brand/` (wordmark SVG, icon PNGs),
  `src/app/{favicon.ico,icon.svg,apple-icon.png,manifest.ts}`, `src/app/icon1.png` (192 px PNG, a copy of
  `public/brand/icon-192.png`, for Google's favicon: it ignores SVG), `src/app/[locale]/opengraph-image.jpg` (share
  image, JPEG ~69 KB, converted with sharp at quality 82).
- **Mockups:** `docs/design/mockups/` (`chosen-gece-turkuaz.html`, `directions-a-b-c.html`, `shelved-logo-concepts.*`).
  The Turkish sheets shown to Samet are in `mockups/samet-tr/` (PNG; PDFs were the same images, one page each).
- **WhatsApp photos:** `docs/design/brand/whatsapp/` — `grup.jpg` for every group (circle crop),
  `topluluk-gece.jpg` for the community (rounded square, in use); `topluluk-krem.jpg` / `topluluk-gunbatimi.jpg` are
  the unused options.

The home page's route line (turquoise, `status` / `status-foreground`) and the "34 RV 2026" plate are part of the
brand vocabulary; mockups: `docs/design/mockups/home-rota-34*.html`. The line never crosses a photo: on phones it
bends off the left edge above each edge-to-edge photo and back in below it (iltan, 2026-11-14; `RouteBend` in
`src/components/home/route.tsx`).

## Fallback directions

- **1 · Gece** (orange only, no teal): values in `mockups/chosen-gece-turkuaz.html` (`.night` without `.teal`).
- **A** and **C**: `mockups/directions-a-b-c.html`. Shelved logo concepts: `mockups/shelved-logo-concepts.*`.
- **Switching = replace the token values in `globals.css` (+ re-run the contrast test).**

## Asset provenance

- Badge: club WhatsApp JPEG (`docs/design/brand/badge-original-whatsapp.jpg`) → Real-ESRGAN `realesrgan-x4plus` 4× → elliptical
  mask → `docs/design/brand/badge-2048.png` (and the cream wordmark master) → wordmark traced to SVG (potrace).
- The **wordmark master (`docs/design/brand/wordmark-cream-master.png`) is the real source** for letters: `docs/design/brand/monogram-cream-master.png` is
  badly cut (R leg, V, & overlap), so the R&V icon artwork was rebuilt from the wordmark's letters.
- The print-resolution master `ride-vibe-logo-baski-4665.png` (4665 px, 21 MB) is kept outside git, on iltan's
  Google Drive. Everything else is reproducible from this folder.
- WhatsApp photos (Pillow, from `badge-2048.png`), set **manually** by Samet:
  - group: 1024 px square, badge 1000 px centred on `#0B0B0C` (the badge's outer ring colour), so a circle crop
    never shows light corners;
  - community: 1024 px square, badge 860 px centred on night `#0B0D10` with a soft blurred `#F98D2F` glow
    (WhatsApp shows communities as a rounded square, so the badge needs a margin and a real background).
- Details and gotchas: `docs/learnings/ui.md`, `docs/learnings/environment.md`.

## Open items

- The production badge `src/assets/brand/badge.png` is 1.26 MB; `next/image` optimises it at serve time.
