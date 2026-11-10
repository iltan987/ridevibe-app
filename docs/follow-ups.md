# Follow-ups

The single backlog for everything that was consciously **not** done: open decisions, deferred features, parked edge
cases, polish and tech debt. Every session reads it before planning, and every iteration adds what it defers (review
findings marked minor/deferred/parked, "out of scope" items, ideas) **in the same commit as the work**. Remove an item
when it is done or dropped (say which in the commit message). Bigger roadmap items live in `docs/PLAN.md`; this file
holds the rest and links there.

Item format: `- **Title** (YYYY-MM-DD, origin) — what and where. Why deferred / risk if left.`

## Next up (iltan asked for these; start in a new session)

- **Loading states iteration** (2026-11-10, iltan) — one branch, through the usual design → plan → build flow:
  1. **Make skeletons match the real layout.** iltan noticed a small layout jump when data replaces a skeleton (e.g.
     skeleton height ≠ real button height). Audit every `<Suspense fallback>` (`/apply`, `/account`, `/sign-in`,
     `/admin/applications` + detail, `/admin/members`, `/admin/roles`, header user menu, link-account dialog) at 390px
     and desktop, in both themes, and size each skeleton like what replaces it. Includes the `/apply` 60rem skeleton
     that collapses to a small notice card (see Polish below).
  2. **Decide whether we need `loading.tsx`.** With `cacheComponents` + `partialPrefetching` the static shell is
     prefetched and per-section `<Suspense>` already streams; check the Next 16 docs
     (`node_modules/next/dist/docs/`) for what `loading.tsx` adds in this setup and add it only where a route has no
     instant shell.
  3. **Click/navigation indicator.** Today nothing reacts between tapping a link or bottom-tab item and the new page
     appearing (feels frozen on slow mobile data). Options to evaluate: pending state on the tapped nav item
     (`useLinkStatus` in Next 16, check docs), a thin top progress bar, or both. Must not break static rendering or
     the Turkish-uppercase/`Wordmark` rules.

## Open decisions (need iltan)

- **Lock the member name after activation?** (2026-11-09, application gaps) — staff can now correct names and the
  approved application's name is copied to the profile, but members can still change their own `full_name`
  (`profiles` update grant), so a nickname can come back. Decide in the Members iteration.
- **Ban evasion vs. linking** (2026-11-09, application gaps) — when the ban list is built (PLAN "Member conduct"),
  check new applications *and* staff links (`link_application`) against it.

## Features

- **`unlink_application` RPC** (2026-11-09, final review) — undo a wrong link without SQL (`applications.decide`, open
  applications only). The confirm step makes wrong links rare. Also in `docs/PLAN.md`.
- **Retention of pending accounts that never apply** (2026-11-09, spec) — KVKK minimisation; delete/anonymise after a
  period decided with the other retention periods. Also in `docs/PLAN.md`.
- **Sign-in without a Google account** (2026-11-09, spec "Not in scope") — SMS/phone OTP needs a paid SMS provider and
  Turkish sender registration. Revisit only if members without Google accounts keep showing up.
- **History of staff corrections** (2026-11-09, spec) — name/phone/email corrections only bump `updated_at`; who
  changed what is not recorded. Add an audit trail if disputes come up.
- **Applicants editing their own application** (2026-11-09, spec) — out of scope; staff correct it instead.

## Parked edge cases (known, judged harmless for now)

- **Email-based activation skips the "already linked" guard** (2026-11-09, final review) — correcting an approved
  application's email (or signing in with it) can activate an account that still has its own open linked application;
  that application lingers until staff reject it. `link_application` refuses this case; the trigger path doesn't.
- **Linked account without a `member_contacts` row** (2026-11-09, final review) — the application page then shows only
  the Google name, no email and no mismatch warning. Every account gets a row from the sign-up trigger, so this
  should not happen.
- **Approve text for an already-active linked account** (2026-11-09, final review) — still says the account "becomes an
  active member"; approval changes nothing for it. Cosmetic.
- **Approve text when the linked account is hidden by RLS** (2026-11-09, task 7) — superseded by
  `application_account`, which shows status to every viewer; keep an eye on it if that RPC changes.

## Polish and tech debt

### Database / tests
- **Turkish case folding in `linkable_accounts` search** (2026-11-09) — `ilike` doesn't fold `ı/İ`
  (`supabase/schemas/20_applications.sql`). Email search and name-match ordering compensate.
- **Email matching scans `applications`** (2026-11-09) — `private.normalize_email` can't be indexed on a table anon
  writes. Fine at today's volume (tens of rows); revisit if applications reach thousands.
- **pgTAP gaps** (2026-11-09) — no test for an *inactive* staff member holding `applications.view` /
  `applications.decide` calling the new RPCs (covered indirectly by `private.has_permission`).
- **Learnings note** (2026-11-09) — `session_replication_role = replica` (used to plant legacy rows in pgTAP) also
  skips foreign-key checks; add one clause to the `docs/learnings/testing.md` entry.

### App logic
- **`isGoogleMailAddress("gmail.com")` returns true** without an `@` (`src/lib/applications/contact.ts`). Callers
  validate the email first.
- **`chromeIntentUrl` hard-codes `https`** (`src/lib/auth/in-app-browser.ts`) — only matters on `http://localhost`.
- **Unit-test gaps** — NFD / `i̇` input for name matching; WhatsApp, Instagram-Android and `BytedanceWebview` user
  agents for in-app detection.
- **"Not signed in" filter predicate duplicated** in list and count (`src/lib/applications/queries.ts`); could drift.
- **Contact editor shows the generic "invalid" message** for a DB `23514` (only reachable by bypassing Zod).
- **Rename dialog can be closed mid-save** (`src/components/admin/member-name-dialog.tsx`) — a failure after closing is
  lost; also its failure type includes an unreachable `duplicate`.

### UI / accessibility
- **`/apply` notice cards** — the 60rem skeleton collapses to a small card (layout jump), and the form intro still shows
  above "already a member" / "under review".
- **Non-Gmail note on `/apply`** has no `aria-live`, so screen readers don't hear it appear.
- **In-app notice on `/sign-in`** — appears after hydration (layout shift, inherent to the static page); the copied URL
  keeps `?next`/`?error`; the "copied" live region sits inside `role="alert"` (possible double announcement); light-theme
  muted text on the tint is ~4.6–5.0:1 (passes AA, thin margin).
- **Link-account dialog** — focus isn't moved between the list and confirm steps; results/empty state have no live
  region.
- **`src/components/ui/dialog.tsx` default "Close" labels are English** — both current dialogs pass
  `showCloseButton={false}`; a future caller using the defaults would leak English.
- **`Admin.empty`** ("No applications with this status") reads oddly on the "Not signed in" tab.

### Tooling
- **Supabase CLI 3.1.0 is available** (2026-11-10; installed 3.0.0).
