# Own "install the app" prompt — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** signed-in active and pending accounts that haven't installed the app see our own install banner on `/account`
and `/members` and an "Uygulamayı yükle" avatar-menu entry: one tap where the browser allows it, a step guide
elsewhere.

**Architecture:** an inline `<head>` script catches `beforeinstallprompt` (cancels Chrome's mini-infobar, holds the
event on `window`) and `appinstalled` before hydration. Pure helpers decide platform and variant; a small injectable
store (read with `useSyncExternalStore`, server snapshot "nothing") combines the held event, installed state, the
Android fallback timer and the 30-day dismissal. Client components render a floating banner, a guide dialog and the
menu entry inside server branches that already know the account status. No service worker, no DB change.

**Tech Stack:** Next.js 16 App Router (`cacheComponents`), React 19 + Compiler, next-intl, Tailwind 4, shadcn/Base UI
`dialog`, lucide icons, `node --test`, Puppeteer E2E.

**Spec:** `docs/superpowers/specs/2026-11-12-install-prompt-design.md`

## Global Constraints

- Branch `feat/install-prompt` (exists, spec committed). No worktrees. Conventional Commits, author iltan, **no
  `Co-Authored-By` or other trailers**.
- Before every code commit: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`.
- Tested modules (`src/lib/pwa/*.ts`) are dependency-free and import relatively with `.ts` extensions.
- Inline scripts only via `InlineScript`; a stringified function must be self-contained (arguments only).
- Client-only reads via `useSyncExternalStore`; never `setState` in an effect (React Compiler lint). Base UI composes
  with `render`, not `asChild`; `cn` from `@/lib/utils`.
- Storage keys: `rv-install-dismissed` (epoch ms as string), `rv-install-installed` (`"1"`). Window property
  `__rvInstallPrompt`; custom event `rv-install-change` on `window`. Dismissal lasts `30 * 24 * 60 * 60 * 1000` ms.
  Android fallback wait: 30 000 ms after the first user activation.
- Audience: `active` and `pending` profiles only. Nothing in the server HTML (server snapshot = `NO_INSTALL`).
- Every UI string in `messages/tr.json` (source of truth, "sen") **and** `messages/en.json`, namespace `Install`.
- No new dependencies. Never log personal data.

## Review Focus

- **Last content hidden behind the floating banner** (last member card, the photo-consent "Kaydet" at the bottom of
  `/account`): scrolled to the bottom, the last content element must end above the banner. Pinned in Task 4 (in-flow
  invisible copy as spacer) and Task 6 (E2E bounding boxes).
- **Banner over the tab bar / home indicator at 390px:** banner bottom ≤ tab bar top, nothing overlaps. Task 6 (E2E).
- **"Yükle" pressed twice / after a cancel:** a used `BeforeInstallPromptEvent` throws on a second `prompt()`; the store
  must drop it after one use and fall back to the guide variant. Task 3 (unit).
- **Language switch** (the `[locale]` layout remounts, the inline script is inert): the banner stays, in English, and
  "Install" still calls `prompt()`. Task 6 (E2E).
- **Guide dialog opened from the avatar menu:** opens on top of everything, Escape/close button closes it, the menu
  doesn't swallow it. Task 6 (E2E).

---

### Task 1: Platform and variant rules (pure)

**Files:**
- Create: `src/lib/pwa/platform.ts`, `src/lib/pwa/platform.test.ts`

**Interfaces:**
- Produces:
  - `type InstallPlatform = "ios-safari" | "ios-other" | "android" | "desktop-safari" | "other"`
  - `detectInstallPlatform(env: { userAgent: string; maxTouchPoints: number }): InstallPlatform`
  - `type InstallVariant = "prompt" | "ios-safari" | "ios-other" | "android-manual" | "desktop-safari" | "none"`
  - `installVariant(s: { platform: InstallPlatform; hasPrompt: boolean; installed: boolean; androidFallback: boolean }): InstallVariant`
  - `showsBanner(variant: InstallVariant): boolean` — true for `prompt`, `ios-safari`, `ios-other`, `android-manual`
  - `DISMISS_MS = 2_592_000_000`; `isDismissed(dismissedAt: number | null, now: number): boolean` → `dismissedAt !== null && now - dismissedAt < DISMISS_MS`

Rules (spec §1–2): iOS = `/iPhone|iPad|iPod/` or (`Macintosh` and `maxTouchPoints > 2`); iOS non-Safari =
`/CriOS|EdgiOS|FxiOS|OPT|YaBrowser|Ddg|Brave/`. Android = `/Android/i`. Desktop Safari = `Macintosh`, `maxTouchPoints`
0, `Version/(\d+)` ≥ 17, no `/Chrome|Chromium|Firefox|Edg/`. `installVariant`: installed → `none`; `hasPrompt` →
`prompt`; then `ios-safari`/`ios-other`/`desktop-safari` by platform; `android` → `android-manual` if
`androidFallback`, else `none`; `other` → `none`.

- [ ] **Step 1: Write the failing tests** (`node:test`, `assert/strict`), UA strings as constants at the top:
  - iPhone Safari 26 → `ios-safari`; iPhone `CriOS` / `EdgiOS` / `FxiOS` → `ios-other`; iPad with Mac UA
    (`Macintosh … Version/26.0 Safari`) + `maxTouchPoints: 5` → `ios-safari`; Android Chrome, Android Firefox,
    Samsung Internet (`SamsungBrowser`) → `android`; macOS Safari `Version/17.4` touch 0 → `desktop-safari`;
    `Version/16.6` → `other`; macOS Chrome and Windows Firefox → `other`
  - `installVariant`: `installed: true` with `hasPrompt: true` → `none`; `hasPrompt` on every platform → `prompt`;
    `android` without/with `androidFallback` → `none` / `android-manual`; each iOS/desktop-safari platform → same-named
    variant; `other` → `none`
  - `showsBanner`: true for the four, false for `desktop-safari` and `none`
  - `isDismissed`: `null` → false; `now - DISMISS_MS + 1` → true; `now - DISMISS_MS` → false
- [ ] **Step 2: Run** `pnpm test` → fails (module not found).
- [ ] **Step 3: Implement** `platform.ts`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` → pass.
- [ ] **Step 5: Commit** `feat(pwa): platform and install-variant rules`.

### Task 2: Early capture script in the layout

**Files:**
- Create: `src/lib/pwa/install-script.ts`, `src/lib/pwa/install-script.test.ts`
- Modify: `src/app/[locale]/layout.tsx` (`<head>`: `<InlineScript html={installCaptureScript} />` after `<ThemeScript />`)

**Interfaces:**
- Produces:
  - `INSTALL_DISMISSED_KEY = "rv-install-dismissed"`, `INSTALL_INSTALLED_KEY = "rv-install-installed"`,
    `INSTALL_CHANGE_EVENT = "rv-install-change"`, `INSTALL_PROMPT_PROP = "__rvInstallPrompt"`
  - `installCaptureScript: string` — `(${captureInstall.toString()})(window, <keys as JSON args>)`.
    `captureInstall(win, promptProp, installedKey, changeEvent)`: on `beforeinstallprompt` → `e.preventDefault()`,
    `win[promptProp] = e`, dispatch `new win.Event(changeEvent)`; on `appinstalled` → `win[promptProp] = null`,
    `localStorage.setItem(installedKey, "1")` inside `try`, dispatch. Guard against double registration with a
    `win.__rvInstallCaptured` flag (a client-rendered script is inert, but be safe).

- [ ] **Step 1: Write the failing tests** — run the script in `node:vm` with a fake `window` (an `EventTarget` with
  `Event`, `localStorage` fake, `addEventListener`), like `theme.test.ts`:
  - a fake `beforeinstallprompt` event → its `preventDefault` called once, `window.__rvInstallPrompt` is that event,
    one `rv-install-change` dispatched
  - `appinstalled` → prop `null`, storage `rv-install-installed` = `"1"`, change dispatched
  - `localStorage.setItem` throws → no exception, prop still cleared
  - running the script twice → one `preventDefault` per event (no double listeners)
- [ ] **Step 2: Run** `pnpm test` → fails.
- [ ] **Step 3: Implement** `install-script.ts` and add it to the layout `<head>`.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` → pass.
- [ ] **Step 5: Commit** `feat(pwa): catch the install event before hydration`.

### Task 3: Install store + manifest

**Files:**
- Create: `src/lib/pwa/install-store.ts`, `src/lib/pwa/install-store.test.ts`
- Modify: `src/app/manifest.ts`, `src/app/manifest.test.ts`

**Interfaces:**
- Consumes: Task 1 (`detectInstallPlatform`, `installVariant`, `showsBanner`, `isDismissed`), Task 2 (keys, event, prop)
- Produces:
  - `type InstallSnapshot = { variant: InstallVariant; banner: boolean }`; `NO_INSTALL: InstallSnapshot` = `{ variant: "none", banner: false }`
  - `type InstallEnv = { window: Window; now(): number; setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }`
  - `createInstallStore(env: InstallEnv): InstallStore`; `InstallStore = { subscribe(l: () => void): () => void; getSnapshot(): InstallSnapshot; install(): Promise<void>; dismiss(): void }`
  - `installStore(): InstallStore` — lazy client singleton with the real `window`/`Date.now`/timers
  - Manifest: `id: "/"`, `related_applications: [{ platform: "webapp", url: "https://ridevibe.com.tr/manifest.webmanifest" }]`

Behaviour: the snapshot is cached and replaced only when `variant` or `banner` changes (stable reference for
`useSyncExternalStore`). On the first `subscribe`: listen to `rv-install-change`, `storage`, the
`(display-mode: standalone)` media query; call `navigator.getInstalledRelatedApps?.()` once (non-empty → installed;
rejections ignored); Android: if `!("BeforeInstallPromptEvent" in window)` → `androidFallback = true` at once, else
poll `navigator.userActivation.hasBeenActive` every 1 000 ms and, once true, start a 30 000 ms timer that sets
`androidFallback` (stop when an event arrives). Installed = standalone media query ∨ `navigator.standalone === true` ∨
storage `"1"` ∨ related apps. `banner = showsBanner(variant) && !isDismissed(stored, now())`; storage reads in `try`
(throws → not dismissed / not installed). `install()`: take and clear `window.__rvInstallPrompt`, `await prompt()`,
read `userChoice`; outcome `"dismissed"` → `dismiss()`; `prompt()` throwing → just drop the event. `dismiss()` writes
`String(now())` (in `try`) and recomputes.

- [ ] **Step 1: Write the failing tests** with a fake env (fake window/EventTarget, storage, `matchMedia`, navigator,
  manual timers):
  - Android UA, event held → `{ variant: "prompt", banner: true }`; `getSnapshot()` twice returns the same object
  - `install()` → `prompt()` called once, prop cleared; a second `install()` doesn't call it again; outcome
    `dismissed` → `banner: false`, `rv-install-dismissed` written, variant falls back (`android` → `none` until the
    fallback, iOS n/a)
  - `prompt()` rejects → no throw, variant falls back
  - after a `dismissed` outcome a new event arrives (`rv-install-change`) → `{ variant: "prompt", banner: false }`
    (menu entry usable, banner still dismissed)
  - iPhone UA → `ios-safari`, banner true; `dismiss()` → banner false, variant unchanged; `now` advanced by `DISMISS_MS`
    + `storage` event → banner true again
  - `storage` event setting `rv-install-installed` (other tab) → `NO_INSTALL`-equal snapshot, listener called
  - standalone media query matches → variant `none`
  - Android without `BeforeInstallPromptEvent` → `android-manual` at once; with it: no activation → `none` after 60 s;
    activation then 30 s → `android-manual`; event arriving before the 30 s → `prompt`
  - `localStorage` getter throws → banner true, no exception
  - `manifest.test.ts`: `id === "/"` and the `related_applications` entry
- [ ] **Step 2: Run** `pnpm test` → fails.
- [ ] **Step 3: Implement** the store and the manifest fields.
- [ ] **Step 4: Run** `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` → pass.
- [ ] **Step 5: Commit** `feat(pwa): install state store; manifest id and related app`.

### Task 4: Banner and guide dialog on /account and /members

**Files:**
- Create: `src/components/pwa/use-install.ts`, `src/components/pwa/install-banner.tsx`,
  `src/components/pwa/install-guide-dialog.tsx`
- Modify: `messages/tr.json`, `messages/en.json`, `src/app/[locale]/account/page.tsx`, `src/app/[locale]/members/page.tsx`

**Interfaces:**
- Consumes: Task 3 (`installStore`, `NO_INSTALL`, `InstallSnapshot`), Task 1 (`InstallVariant`)
- Produces:
  - `useInstall(): InstallSnapshot & { install(): Promise<void>; dismiss(): void }` —
    `useSyncExternalStore(s.subscribe, s.getSnapshot, () => NO_INSTALL)`
  - `InstallGuideDialog({ variant, open, onOpenChange }: { variant: Exclude<InstallVariant, "prompt" | "none">; open: boolean; onOpenChange(open: boolean): void })`
  - `InstallBanner()` — no props; renders nothing unless `banner`

Banner (spec §2): `role="region"` with `aria-label={t("bannerLabel")}`; fixed `inset-x-3
bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 md:inset-x-auto md:right-4 md:bottom-4 md:w-96`; card surface
(`bg-card border rounded-xl shadow-lg`), `ClubBadge` (40px), title + body, primary button ("Yükle" for `prompt` →
`install()`, else "Nasıl?" → opens the dialog), ghost "Şimdi değil" → `dismiss()`. Entrance animation with
`motion-safe:` only. **Spacer:** the component also renders the same card markup in flow with `invisible`,
`aria-hidden` and `inert` (identical height, no measuring) — so it must be placed as the **last** child of the page
content. Dialog: shadcn `Dialog` with `showCloseButton={false}` and our own close button (`t("close")`), title, an
`<ol>` of the variant's three steps with lucide icons (`Share`, `SquarePlus`, `EllipsisVertical`, `Menu`).

Placement: `/account` → last child of `AccountDetails` for `active` and `pending`; `/members` → last child of the
active `Directory` branch only (pending accounts get it on `/account`, their landing page). Not for `inactive`.

Messages (`Install`, TR / EN):

| Key | tr | en |
|---|---|---|
| `bannerLabel` | Uygulamayı yükle | Install the app |
| `bannerTitle` | Ride & Vibe'ı ana ekranına ekle | Add Ride & Vibe to your home screen |
| `bannerBody` | Tek dokunuşla açılır, tam ekran. | Opens with one tap, full screen. |
| `install` | Yükle | Install |
| `howTo` | Nasıl? | How? |
| `notNow` | Şimdi değil | Not now |
| `menuItem` | Uygulamayı yükle | Install the app |
| `guideTitle` | Ana ekrana ekle | Add to home screen |
| `close` | Kapat | Close |
| `steps.ios-safari.1–3` | Safari'de Paylaş düğmesine dokun (iOS 26: önce •••). · Ana Ekrana Ekle'ye dokun. · "Web Uygulaması olarak aç" açık kalsın, Ekle'ye dokun. | Tap Share in Safari (iOS 26: tap ••• first). · Tap Add to Home Screen. · Keep "Open as Web App" on and tap Add. |
| `steps.ios-other.1–3` | Adres çubuğundaki Paylaş düğmesine dokun. · Ana Ekrana Ekle'ye dokun. · Ekle'ye dokun. | Tap Share in the address bar. · Tap Add to Home Screen. · Tap Add. |
| `steps.android-manual.1–3` | Tarayıcı menüsünü aç (⋮). · "Uygulamayı yükle" ya da "Ana ekrana ekle"ye dokun. · Yükle'ye dokun. | Open the browser menu (⋮). · Tap "Install app" or "Add to Home screen". · Tap Install. |
| `steps.desktop-safari.1–3` | Menü çubuğunda Dosya'yı aç. · Dock'a Ekle'yi seç. · Ekle'ye tıkla. | Open File in the menu bar. · Choose Add to Dock. · Click Add. |

(Keys `steps.<variant>.1` … `.3`; the iOS wording is checked on a real iPhone in Task 6 and adjusted there.)

- [ ] **Step 1: Add the messages** (both files) and implement `useInstall`, `InstallGuideDialog`, `InstallBanner`.
- [ ] **Step 2: Place the banner** on `/account` and `/members` as described.
- [ ] **Step 3: Smoke check:** `pnpm build && pnpm start -p 3123`, sign in as `member@test.local` (README recipe), open
  `/members` in the scratchpad probe from the spec (Chrome with `--bypass-app-banner-engagement-checks`): banner with
  "Yükle" visible; with an iPhone UA "Nasıl?" opens the Safari steps. Screenshot to the scratchpad, look at it.
- [ ] **Step 4: Run** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` → pass.
- [ ] **Step 5: Commit** `feat(pwa): install banner and guide on /account and /members`.

### Task 5: Avatar-menu entry

**Files:**
- Create: `src/components/pwa/install-menu-item.tsx`
- Modify: `src/components/auth/user-menu.tsx`, `src/components/auth/user-menu-dropdown.tsx`

**Interfaces:**
- Consumes: Task 4 (`useInstall`, `InstallGuideDialog`)
- Produces: `UserMenuDropdown` prop `showInstall: boolean` (`user-menu.tsx`: `profile?.status` is `active` or
  `pending`); `InstallMenuItem({ onGuide }: { onGuide(): void })` — a `DropdownMenuItem` (lucide `Download`,
  `t("menuItem")`) rendered only when `variant !== "none"`; `prompt` → `install()`, others → `onGuide()`.

`UserMenuDropdown` keeps `guideOpen` state and renders `<InstallGuideDialog>` as a **sibling after** `<DropdownMenu>`
(fragment), not inside the menu content, so closing the menu doesn't unmount it. Place the item after the account
link.

- [ ] **Step 1: Implement** the item, the prop and the dialog wiring.
- [ ] **Step 2: Smoke check** like Task 4 step 3: menu shows "Uygulamayı yükle" for the member; iPhone UA → the guide
  opens over the page after the menu closes.
- [ ] **Step 3: Run** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` → pass.
- [ ] **Step 4: Commit** `feat(pwa): install entry in the avatar menu`.

### Task 6: Browser E2E, docs, full verification

**Files:**
- Create: `scripts/e2e/install-e2e.mjs`
- Modify: `scripts/e2e/e2e-lib.mjs` (`args` option), `scripts/e2e/README.md`, `CLAUDE.md` (E2E command list: add `install`), `docs/learnings/testing.md`,
  `docs/follow-ups.md`, `docs/PLAN.md` (status line: own install prompt done)

E2E (PASS/FAIL lines, exit ≠ 0 on failure; `e2e-lib.mjs` `launch({ scrollbars, args = [] })` gains an `args` option
appended to Chrome's arguments, used for `--bypass-app-banner-engagement-checks`; also add `e2e-lib.mjs` to Files;
fixtures `member@`, `pending-noapp@`, an inactive user per README; `prompt()` and
`userChoice` stubbed by wrapping the event in `evaluateOnNewDocument`; **standalone via a `matchMedia` stub** in
`evaluateOnNewDocument` — CDP/Puppeteer reject `display-mode` emulation in Chrome 157):
- member, Chrome 390px, `/members` and `/account`: banner with "Yükle"; click → `prompt()` called once; outcome
  `dismissed` → banner gone, still gone after reload, menu entry still there
- second tab: dismissal in tab A hides the banner in tab B without reload
- iPhone Safari UA: "Nasıl?" opens the dialog with the 3 Safari steps; Escape closes it
- avatar menu → "Uygulamayı yükle" with iPhone UA → dialog visible above the page, close button closes it
- Android Firefox UA (no `BeforeInstallPromptEvent`): `android-manual` guide reachable right away
- standalone stub, and `rv-install-installed = "1"`: no banner, no menu entry
- pending account: banner on `/account`, none on `/members`; inactive and signed-out: nothing
- layout (Review Focus): scrolled to the bottom of `/account` and `/members` at 390px the last content element ends
  above the banner's top; banner bottom ≤ tab bar top; content above doesn't move when the banner appears
- TR → EN switch: banner still shown in English, "Install" still calls `prompt()`
- no hydration warnings in the console

Docs:
- `docs/learnings/testing.md`: entry "display-mode can't be emulated in headless Chrome; stub matchMedia"
- `docs/follow-ups.md`: remove the install item from "Next up"; add anything deferred by reviews; keep the Web Install
  API watch as a Features item ("Web Install API / `<install>`: switch when stable")
- real-device checklist for iltan in the final report (spec §4): Android Chrome (+ Samsung Internet), iPhone Safari
  (check the step wording against the real share sheet and fix `steps.ios-*` if needed), desktop Chrome menu entry

- [ ] **Step 1: Write** `install-e2e.mjs` and run it against `pnpm start -p 3123` → all PASS (fix code, not the test,
  when a check fails for a real reason).
- [ ] **Step 2: Update the docs** listed above.
- [ ] **Step 3: Full verification:** `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`, and re-run the
  existing `nav`, `header`, `members`, `apply-nav` E2E scripts (banner must not break them) → pass (the known
  `nav-e2e` "reduced motion: full width" failure from follow-ups stays as is).
- [ ] **Step 4: Commit** `test(pwa): browser E2E for the install prompt; docs`.
