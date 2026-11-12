# Own "install the app" prompt — design

Status: **approved by iltan (2026-11-12), implemented on feat/install-prompt**. Backlog entry "Own "install the app" prompt"
in `docs/follow-ups.md` (Next up).

## Why

Members close the browser's own install pop-up, so the app never reaches their home screen. We want our own, clearer
prompt: one tap to install where the browser allows it, a short step-by-step guide where it doesn't (iPhone/iPad).

**Done when:** a signed-in active or pending person who hasn't installed the app sees our install banner on `/account`
and `/members` and an "Uygulamayı yükle" entry in the avatar menu; on Chrome/Edge/Samsung Internet one tap opens the
system install dialog; on iPhone/iPad (and where the browser gives us no install event) a guide explains the steps;
nobody sees anything once the app is installed or while using it; "Şimdi değil" hides the banner for 30 days; existing
production users get it without any migration.

## Decisions (iltan, 2026-11-12)

- **Scope: install prompt only.** No service worker, no offline page, no Web Push. Web Push comes with Events, when
  there is something to notify about. The copy doesn't promise notifications.
- **Audience: signed-in `active` and `pending` accounts.** Pending people are mostly approved later, and then the app is
  already on their phone. Not for visitors (they shouldn't be pulled away from the application form) or `inactive`
  members.
- **Places:** a floating banner on `/account` (where every sign-in lands, also the approval invite link) and on
  `/members` (the page active members actually use; existing members rarely open `/account`), plus an avatar-menu
  entry. When a member home page exists (Events), the banner moves/copies there.
- **Approach: own component** (not the `pwa-install` web component, not a static help page), borrowing edge-case
  handling from `@khmyznikov/pwa-install` 0.7.0 (MIT; source read 2026-11-12, see "Prior art").
- **Chrome's own mini-infobar is suppressed for everyone** (`preventDefault()` on `beforeinstallprompt`): dismissing
  it triggers Chrome's long cool-down, and members get our banner instead.
- **Out of scope:** cross-tab sign-in/language sync (own iteration, follow-ups "Next up"), the "ön alım" membership stage
  (follow-ups, open decision), the Web Install API / `<install>` element (origin trial only, keep watching), a native
  app / TWA.

## Facts this rests on (checked 2026-11-12)

- **No service worker needed for `beforeinstallprompt`:** a local production build with only the manifest
  (`src/app/manifest.ts`) has no installability errors in Chrome 157 (`Page.getInstallabilityErrors` → `[]`) and fires
  `beforeinstallprompt` (engagement checks bypassed). Chrome's blog post "Revisiting Chrome's installability criteria"
  still says the prompt needs a `fetch()` handler: outdated. In real use Chrome also wants engagement (a tap and ~30 s
  on the site, web.dev "install criteria").
- **iPhone/iPad:** no programmatic install (no `beforeinstallprompt` in WebKit). Since iOS 26 every Home Screen site
  opens as a web app ("Open as Web App" is on by default in the Add to Home Screen sheet). Other iOS browsers (Chrome,
  Edge, Firefox) also offer "Add to Home Screen" from their share menu.
- **Firefox for Android:** no `beforeinstallprompt`; installs from its menu. **Samsung Internet:** supports the event
  (reports from v27 are mixed → the Android fallback covers it if it doesn't fire).
- **Signed-in people are never in a social in-app browser:** Google blocks sign-in there and those browsers don't share
  cookies with Safari/Chrome. So no in-app variant is needed for this audience.

## 1. Behaviour

**Hidden when installed:** any of `matchMedia("(display-mode: standalone)")`, iOS `navigator.standalone`, a non-empty
`navigator.getInstalledRelatedApps()` (Chrome: our own PWA installed while this is a browser tab), or our "installed"
flag (set on `appinstalled`).

**Variant per browser** (first match wins):

| Situation | Variant | Banner | Menu entry | Action |
|---|---|---|---|---|
| A `beforeinstallprompt` event is held | `prompt` | yes | yes | "Yükle" → `event.prompt()` (system dialog) |
| iPhone/iPad Safari | `ios-safari` | yes | yes | Guide: Paylaş ⎙ → Ana Ekrana Ekle → "Web Uygulaması olarak aç" on → Ekle |
| iPhone/iPad Chrome/Edge/Firefox/other | `ios-other` | yes | yes | Guide with that browser's share button (Chrome/Edge: in the address bar; Firefox: menu) |
| Android, no event 30 s after the first user interaction | `android-manual` | yes | yes | Guide: browser menu ⋮ → "Uygulamayı yükle" / "Ana ekrana ekle" |
| macOS Safari 17+ | `desktop-safari` | no | yes | Guide: Dosya → Dock'a Ekle (or Share → Dock'a Ekle) |
| Anything else (desktop Firefox, desktop Chrome before the event, …) | `none` | no | no | — |

The Android fallback follows `pwa-install`: after the first interaction (`navigator.userActivation.hasBeenActive`),
wait up to 30 s for the event; if none came, switch to `android-manual`. If the event arrives later, `prompt` wins.
Android without `BeforeInstallPromptEvent` in `window` (Firefox) skips the wait.

**Dismissal:** "Şimdi değil" (or closing the system dialog with "cancel", `userChoice.outcome === "dismissed"`) stores a
timestamp; the banner stays hidden for 30 days in this browser. The menu entry stays until installed. A successful
install sets the "installed" flag and hides everything.

**Data / KVKK:** only `localStorage` flags in the browser (`rv-install-dismissed` = timestamp, `rv-install-installed` =
`"1"`). No server data, no consent, no privacy-notice change.

## 2. Components and data flow

**Early capture** (`src/lib/pwa/install-script.ts` + an `InlineScript` in the `<head>` of `src/app/[locale]/layout.tsx`):
registers `beforeinstallprompt` (calls `preventDefault()`, keeps the event on `window.__rvInstallPrompt`, dispatches a
custom `rv-install-change` event) and `appinstalled` (sets the "installed" flag, clears the event, dispatches). It runs
before hydration because Chrome can fire the event before React hydrates on slow phones, and the cancel must happen
inside the listener. On a language switch the script is inert (see `InlineScript`), but the listeners and the event
already live on `window`.

**`src/lib/pwa/platform.ts`** (pure, dependency-free, unit-tested, relative imports): `detectInstallPlatform({
userAgent, maxTouchPoints, hasPromptEvent })` → `"ios-safari" | "ios-other" | "android" | "desktop-safari" | "other"`.
iPad: Mac user agent with `maxTouchPoints > 2`. iOS non-Safari: `CriOS|EdgiOS|FxiOS|OPT|YaBrowser|Ddg|Brave` (list from
`pwa-install`). macOS Safari: `Macintosh`, no touch points, `Version/NN` with NN ≥ 17, no `Chrome|Chromium|Firefox|Edg`. Plus `installVariant(state)`
combining platform, held event, fallback timer and installed into the variant of section 1.

**`src/lib/pwa/install-store.ts`**: a small store read with `useSyncExternalStore` (server snapshot: "nothing to show",
so the server HTML never contains the banner). Holds: the held event, installed, fallback-elapsed, dismissed-until. It
subscribes to `rv-install-change`, `storage` (other tabs), the `display-mode` media query, and runs the 30 s fallback
timer. Exposes `install()` (calls `prompt()` once, then drops the event; "dismissed" outcome → dismissal) and
`dismiss()`. `localStorage` access is wrapped in `try` (blocked storage: never dismissed, no crash), like
`src/lib/applications/apply-hint.ts`. `getInstalledRelatedApps()` is checked once per page load.

**UI** (`src/components/pwa/`):
- `InstallBanner` (client): fixed at the bottom; on phones above the bottom tab bar, plus
  `env(safe-area-inset-bottom)`; on desktop bottom-right, card width. Club badge icon, one line of pitch
  ("Ride & Vibe'ı ana ekranına ekle: tek dokunuşla açılır, tam ekran."), primary action ("Yükle" or "Nasıl?") and a
  labelled close button ("Şimdi değil"). A labelled `region`, not a modal: never takes focus. Entrance animation off
  under `prefers-reduced-motion`. While it is visible the page gets bottom padding equal to its height so no content
  stays hidden behind it. Floating instead of in-flow on purpose: it can only appear after hydration (and on Android
  sometimes after 30 s), so an in-flow card would push the page down while someone reads; floating needs no skeleton
  change.
- `InstallGuideDialog` (client, shadcn `dialog`): numbered steps with lucide icons per variant (`ios-safari`,
  `ios-other`, `android-manual`, `desktop-safari`), our own close label (not the dialog's English default).
- Rendered in the server branches that already know the status: `/account` (active and pending branches) and
  `/members` (active branch). The avatar menu: `UserMenuDropdown` gets `showInstall` (true for active/pending); the
  entry itself renders client-side only when the variant isn't `none` and the app isn't installed.

**Manifest** (`src/app/manifest.ts`): add `id: "/"` (equal to today's implicit id from `start_url`, so existing
installs keep their identity) and `related_applications: [{ platform: "webapp", url:
"https://ridevibe.com.tr/manifest.webmanifest" }]` for `getInstalledRelatedApps`; `manifest.test.ts` asserts both.

**i18n:** new `Install` namespace in `messages/tr.json` (source of truth) and `messages/en.json`; UI copy says "sen".
Turkish step names follow the iOS/Android Turkish UI ("Paylaş", "Ana Ekrana Ekle", "Uygulamayı yükle").

## 3. Edge cases

- **Language switch:** the layout remounts; the store re-reads `window.__rvInstallPrompt`, nothing is lost.
- **Several tabs:** dismissal/install in one tab hides the banner in the others (`storage` event).
- **`localStorage` blocked:** banner shows (never dismissed), no errors.
- **Event fires again after a cancel:** stored as the new held event; the banner stays dismissed for 30 days, the menu
  entry can use it.
- **Signed out, `inactive`, or inside the installed app:** nothing rendered.
- **Desktop Chrome before engagement:** variant `none` until the event fires, then the menu entry appears (no banner
  pop-in problem: the banner is floating).
- **`prompt()` throws** (event already used): drop the event, fall back to the platform's guide variant.
- **iOS: installed app vs. Safari:** a Home Screen web app has storage separate from Safari, so after installing,
  Safari visits (e.g. from WhatsApp links) still show the banner (again every 30 days after a dismissal); the store
  can't know (`docs/learnings/ui.md`).

## 4. Testing

- **Unit (`pnpm test`):** platform detection table (iPhone Safari, iPhone `CriOS`/`EdgiOS`/`FxiOS`, iPad with Mac UA +
  touch, Android Chrome / Firefox / Samsung Internet, macOS Safari 16 vs 17+, desktop Chrome/Firefox); `installVariant`
  for every row of the section 1 table; the 30-day dismissal boundary; the store's install/dismiss flow with a fake
  event; manifest `id` / `related_applications`.
- **Browser E2E** `scripts/e2e/install-e2e.mjs` against `pnpm start -p 3123` (Chrome with
  `--bypass-app-banner-engagement-checks`, fixture users per `scripts/e2e/README.md`): active member on `/members` and
  `/account` sees the banner with "Yükle" and the menu entry; "Yükle" calls `prompt()` (wrapped in
  `evaluateOnNewDocument`); "Şimdi değil" → gone after reload, menu entry stays; a second tab hides it too; iPhone UA →
  "Nasıl?" opens the Safari guide; Android Firefox UA → the manual guide appears after the fallback wait; standalone
  (CDP media emulation of `display-mode`, or the "installed" flag if emulation isn't supported) → nothing; pending
  account → banner on `/account`; signed-out and inactive → nothing; no layout shift of page content when the banner
  appears; Turkish and English copy.
- **Real devices (iltan, after deploy):** Android Chrome (and Samsung Internet if available): banner → one-tap install →
  opening the app shows no banner; iPhone Safari: guide matches the real share sheet; desktop Chrome: menu entry.
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` before each commit. No DB change.

## Prior art: `@khmyznikov/pwa-install` 0.7.0 (MIT)

Lessons taken (no code copied): a held `beforeinstallprompt` works once — drop it after `prompt()`; Android fallback to
manual instructions when the event doesn't come after user activation (30 s); `getInstalledRelatedApps()` to detect the
installed PWA from a browser tab; iPad detection via Mac UA + touch points; iOS non-Safari detection by UA tokens; iOS 26
detection via `CSS.supports("text-wrap", "pretty")` (not needed: we show the same guide, the "web app" toggle is simply
on since iOS 26); it tries the experimental Web Install API (`navigator.install`) first — we skip it until it ships.
