# Hide "Başvur" for members and applicants — design

Status: **agreed in chat with iltan (2026-11-11)**, awaiting spec review. Backlog entry "Hide "Başvur" for people who
applied or are members" in `docs/follow-ups.md`.

## Why

The primary nav (desktop header and the phone tab bar) and the home hero always offer "Başvur", also to active members
and to people whose application is already under review. For them it is a dead end (`/apply` only shows a notice) and
it takes one of the five phone tabs.

**Done when:** "Başvur" appears in the nav and the home hero exactly when `/apply` would show the form; members and
open applicants get a 4-tab bar on phones; on a second visit nothing in the nav moves between first paint and the
settled page; `/apply` itself behaves as today.

## Decisions (iltan, 2026-11-11)

- **Who sees it** (same rule as `ApplyGate`):

  | State | "Başvur" |
  |---|---|
  | Visitor (signed out) | shown |
  | Signed in, `pending`, no application or a rejected one | shown |
  | `pending` with an open application (`new` / `contacted`) | hidden |
  | `active` | hidden |
  | `inactive` | hidden |

  No "Başvurum" status item for open applicants: `/apply` already says "under review".
- **Phone tab bar without "Başvur": 4 tabs** (Ana Sayfa · Etkinlikler · Üyeler · Galeri), no replacement tab. Desktop
  header simply drops the link.
- **Scope:** desktop nav, bottom tab bar and the home hero's "Başvur" button (members see only "Etkinlikler" there).
- **First-paint guess: session cookie + the last answer remembered in this browser** (approach 2 below).
- **Out of scope:** the broader navigation review once Events exists (stays in follow-ups), any change to `/apply`'s
  notices, the DB or the admin side.

## 1. One rule

- `src/lib/applications/apply-view.ts` (pure, dependency-free, unit-tested): `applyView(profileStatus,
  applicationStatus)` → `"form" | "alreadyMember" | "underReview" | "inactive"`. `profileStatus` is `null` for
  visitors (and for a signed-in user without a profile row, as today: form). `showApply = view === "form"`.
- A server helper `getApplyView()` (React `cache`, per request; `server-only`) reads `getCurrentUser()` and, only for
  `pending` users, `getMyApplicationStatus()`. It keeps today's failure behaviour: on an error it rethrows Next's
  control-flow errors (`unstable_rethrow`), logs only the error code and falls back to the form.
- `ApplyGate` uses `getApplyView()` instead of its own branches, so nav, hero and `/apply` cannot disagree; one request
  makes at most one `my_application_status` call however many parts ask.

## 2. Rendering

The nav and the hero are in the static shell; the answer is request-time data. So each place renders a **fallback
that guesses** and a **streamed part that knows**, inside `<Suspense>`:

- **Streamed part:** a small async server component awaits `getApplyView()` and renders the real nav / hero CTA with
  `showApply`. It also renders a tiny client component that stores the answer in `localStorage`
  (`rv-apply-hidden` = `"1"` / `"0"`; written in an effect, no `setState`).
- **Guess (fallback):**
  - no session cookie (`hasSessionCookie()`) → show;
  - session cookie → the stored answer; nothing stored → hide (most signed-in users are members).
  The guess is a pure function of (cookie present, stored value), unit-tested.
  Visitors' pages also store `"0"` (`RememberApplyHint` runs for every user), on purpose: the main funnel (visitor →
  Google sign-in on /apply → pending without application) then guesses right; the cost is one wrong first load for a
  member who signs in on a device where they browsed signed out.
- **Server HTML (first paint):** the static HTML can't read cookies or storage, so the fallback contains the "Başvur"
  item and an inline script (via `InlineScript`, like `markSessionHint`) sets a `data-` attribute on the nav / CTA
  container before first paint when the guess is "hide"; CSS then hides the item and the tab bar switches from
  `grid-cols-5` to `grid-cols-4`. The script, like `markSessionHint`, is stringified with `toString()` and must be
  self-contained.
- **Client renders of the fallback** (e.g. shown again after a language switch remounts the `[locale]` layout): the
  same guess via `useSyncExternalStore(noSubscribe, client, server)`.
- The existing pathname `<Suspense>` inside `DesktopNav` / `BottomNav` (active-tab highlight) stays as it is.
- The hero's existing `<Suspense>` for the UTM-carrying `ApplyLink` is combined with this one (one fallback, one
  streamed part).
- **After submitting an application** while signed in (the action returns `linked: true`), the form marks a tiny
  client store (`markApplySubmitted`, `src/lib/applications/apply-submitted.ts`) that both navs read in either mode
  (`useApplySubmitted`), so "Başvur" disappears without a reload, and writes `rv-apply-hidden = "1"` for the next
  load's guess. Not via `refresh()`: `submitApplication` deliberately skips it, because `ApplyGate` would then replace
  the success card with "under review" (`docs/learnings/forms.md`). Signed-out visitors keep "Başvur". Sign-out clears
  the store. After approval (staff session) the member's next page load corrects the stored answer.
  *(Amended 2026-11-11 after the Task 5 browser check: the first version assumed a `refresh()`.)*
- **Wrong guesses** (first visit after a status change, a new user on a shared browser, a pending user right after
  the Google fill on step 4): the phone tab bar keeps its height and only re-spaces its icons; on desktop "Başvur" is
  the last header link, so only that link appears/disappears. In the hero, phone buttons stack, so a wrong guess moves
  it by one button row; accepted as rare.
- **Privacy:** the stored flag is a functional preference like the theme and the apply draft, never sent anywhere;
  no notice change.

## 3. Testing

- **Unit (`node --test`):** `applyView` for every row of the table (incl. `rejected` and the no-profile case); the
  guess for cookie × stored value (`"1"`, `"0"`, missing, garbage).
- **Browser E2E** (extend `scripts/e2e/nav-e2e.mjs`, fixtures per `scripts/e2e/README.md`; it became a separate
  `scripts/e2e/apply-nav-e2e.mjs`, as `nav-e2e.mjs` is about the progress bar):
  - visitor: 5 tabs and the hero button; `member@test.local`: 4 tabs, no hero button, no desktop link;
    `pending-noapp@test.local`: 5 tabs; a pending account with an open application: 4 tabs;
  - on a second load, tab positions and the desktop links don't move between first paint and the settled page
    (phone 390px and desktop, TR and EN), also after a language switch and back;
  - a visitor with a stale stored `"1"` but no session cookie still sees "Başvur".
- `ApplyGate` keeps working: `apply-e2e.mjs` still passes.
- Verification as usual: lint, tsc, test, build, E2E; instant-navigation dev check for the layout's new Suspense
  boundaries (`docs/learnings/nextjs.md`).

## 4. Docs

- Remove the item from `docs/follow-ups.md`; add anything deferred.
- CLAUDE.md: the nav line ("Primary nav items live in …") gains a note that "Başvur" is session-dependent.
- A `docs/learnings/` entry for anything non-obvious found on the way.
