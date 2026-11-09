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
  the user picks.
- **Brand:** `src/components/brand/{wordmark,club-badge}.tsx`, `src/assets/brand/badge.png` (production badge), `public/brand/` (wordmark SVG, icon PNGs),
  `src/app/{favicon.ico,icon.svg,apple-icon.png,manifest.ts}`, `src/app/[locale]/opengraph-image.png`.
- **Mockups:** `docs/design/mockups/` (`chosen-gece-turkuaz.html`, `directions-a-b-c.html`, `shelved-logo-concepts.*`).

## Fallback directions

- **1 · Gece** (orange only, no teal): values in `mockups/chosen-gece-turkuaz.html` (`.night` without `.teal`).
- **A** and **C**: `mockups/directions-a-b-c.html`. Shelved logo concepts: `mockups/shelved-logo-concepts.*`.
- **Switching = replace the token values in `globals.css` (+ re-run the contrast test).**

## Asset provenance

- Badge: club WhatsApp JPEG (`docs/design/brand/badge-original-whatsapp.jpg`) → Real-ESRGAN `realesrgan-x4plus` 4× → elliptical
  mask → `docs/design/brand/badge-2048.png` (and the cream wordmark master) → wordmark traced to SVG (potrace).
- The **wordmark master (`docs/design/brand/wordmark-cream-master.png`) is the real source** for letters: `docs/design/brand/monogram-cream-master.png` is
  badly cut (R leg, V, & overlap), so the R&V icon artwork was rebuilt from the wordmark's letters.
- The print-resolution master is kept outside git by iltan.
- The WhatsApp group photo (`ride-vibe-whatsapp-1024.jpg`) is replaced with the upscaled badge **manually**.
- Details and gotchas: `docs/learnings/ui.md`, `docs/learnings/environment.md`.

## Open items

- The production badge `src/assets/brand/badge.png` is 1.26 MB; `next/image` optimises it at serve time.
