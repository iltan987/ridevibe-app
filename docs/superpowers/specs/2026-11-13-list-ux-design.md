# List UX: instant filtering, clean URLs, page numbers — design

Status: **approved by iltan (2026-11-13)**. Backlog entry "List UX iteration" in
`docs/follow-ups.md` (Next up).

## Why

iltan tested `/members` with the real club (~150 members) and the lists felt like a website from 2005:

- **Feels like a reload.** Every side chip and every search is a server round trip behind the skeleton.
- **Ugly URLs.** Clearing the search leaves `?q=`; paging puts a base64 `?cursor=…` in the address bar.
- **No way to jump.** The pager only has "next" and "first": reaching page 14 takes 13 taps.
- The pager itself looks unfinished.

**Done when:** on `/members` and `/admin/members`, typing in the search box and tapping a chip changes the list on the
same frame (no server request, no skeleton); the URL shows only the non-default state (`?q=ali&side=asian&page=2`, never
`?q=` or a cursor) and restores that view on reload or when shared; all three lists (`/members`, `/admin/members`,
`/admin/applications`) have numbered pages; a club past the 2,000-row ceiling sees a visible notice instead of a
silently cut list.

## Decisions (iltan, 2026-11-13)

- **Approach A for `/members`: load everything, filter in the browser** (over B: server filtering with debounced
  search-as-you-type and the old list kept visible). B lags the typing by ~0.5 s (debounce + round trip), which reads
  as "it noticed my search late"; A filters on every keystroke in well under a millisecond.
- **Ceiling 2,000 rows, failing loudly** — generous on purpose (13× today) so growth doesn't force a redesign. Above it
  the page shows a notice and logs an error; it never silently truncates. No automatic server-search fallback above
  the ceiling: a code path that never runs would go untested.
- **Split for the admin lists:** `/admin/members` works like `/members` (everything loaded, instant search + status
  chips, same ceiling). `/admin/applications` stays server-rendered with numbered **offset** pages (`?page=3`): it has
  no search to make instant and grows without bound (rejected applications pile up).
- **Pager: numbered pages** (mockup option A, picked in the browser): `‹ 1 2 [3] 4 … 6 ›` — always first, last,
  current ±1, "…" for gaps — with a range line underneath ("51–75 / 148 üye"). Same component on all three lists.
- **Page size stays 25.**

## Claude's calls (correct if wrong)

- **No shared cache (`use cache`) in this iteration.** The directory RPC checks `auth.uid()`; a shared cache can't read
  the session, so a cached fetch would need the secret key and bypass RLS (the risk already noted under "Redis: not
  now"). With approach A the directory is a single few-ms read from `fra1`. Measure the server time of `/members`
  during the build (Vercel logs / a timing log in dev); only if it is slow, come back with a caching design. The
  follow-up entry is updated to say so.
- **History:** typing in the search box uses `history.replaceState` (one entry, not one per keystroke); chip and page
  clicks use `history.pushState`, so the phone's back button steps back through them. Both integrate with Next's
  router (`useSearchParams` stays in sync — `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`,
  "Native History API").
- **Changing the search or a chip resets to page 1.** A page click scrolls to the top of the list (not the top of the
  document if the list starts lower).
- **Out-of-range `?page=`** (e.g. `?page=99` after filtering, or garbage) is clamped to the last / first page and the
  URL is corrected with `replaceState`. Same on the server for `/admin/applications`.
- **Default values are dropped from the URL:** no `page=1`, no empty `q`, no `side` for "all", no `status=pending` on
  `/admin/members` and no `status=new` on `/admin/applications` (the default tabs today) — e.g.
  `/admin/members?status=active&q=ali`.
- **Reading past Supabase's row limit in chunks.** PostgREST caps every table select and set-returning RPC at
  `[api] max_rows = 1000` (`supabase/config.toml`; production has no override, hosted default is also 1,000) and
  truncates silently. Instead of raising that global guard (it protects every table/RPC and would need a config push
  and a security review) or lowering iltan's ceiling, the loaders read in pages of 1,000 with `.range()` until a short
  page arrives or ceiling + 1 rows are in hand. At today's size that is one request; it becomes two only past 1,000
  rows. A shared helper (e.g. `readAll(fetchRange, ceiling)`) is unit-tested with a fake fetcher (short last chunk,
  exactly 1,000, exactly 2,000, 2,001). Every chunked query needs a total order (`…, id`) so chunks neither skip nor
  repeat rows.

## Out of scope

`use cache` / Redis (above), search on `/admin/applications` (none today; a follow-up if staff ask), the "link to an
account" picker on the application detail page (keeps its keyset "load more" — `findLinkableAccounts`), sorting
options, virtualised rendering (25 cards per page needs none), infinite scroll.

## 1. `/members` (directory)

### Server

- `Directory` (server component, inside the existing `<Suspense>`) keeps the auth gate (signed out → sign-in redirect,
  not active → cards) and the safety-param parsing (`blood`, `noContact`; only for `members.safety`).
- It fetches **all** matching active members in one call: `member_directory` without search/side/cursor, with the
  safety filters when present. The safety filters stay **server-side** because every blood-type filter writes a
  `safety_access_log` row (CLAUDE.md: RPCs that log are called once per render). Choosing a safety filter remains a
  server navigation (as today) and keeps `q`/`side` in the URL.
- **RPC changes** (`supabase/schemas/30_member_directory.sql`, declarative + migration):
  - `member_directory`: drop `search`, `side_filter`, `after_name`, `after_id`, `page_size`; return every matching
    row ordered by `full_name collate "tr-x-icu", id` (no `limit` in SQL — the app reads it in 1,000-row chunks with
    `.range()` and stops at ceiling + 1, see "Reading past Supabase's row limit"). Caveat: with a blood filter the
    function logs once **per chunk call**; that is acceptable only while the filtered result fits one chunk (a blood
    group of a ≤2,000 club always does) — note it in the function comment. The new signature must replace the old one
    (drop the old overload in the migration; pgTAP: one row in `pg_proc`). Permission checks and the per-field
    visibility rules stay exactly as they are.
  - `member_directory_counts`: dropped (counts are computed from the loaded list). Remove its grants, tests and types.
  - pgTAP: update existing directory tests to the new signature (ordering, filters, permissions unchanged). The
    ceiling and chunking are app-side and tested there.
  - **Safety filters UI:** `SafetyFilters` today builds its links / hidden inputs from the server-side `q` and `side`.
    Once search and chips change the URL in the browser those values are stale, so it must read the current URL
    state on the client when it navigates.
- **Ceiling (2,000):** a shared constant in app code (e.g. `LIST_CEILING` in `src/lib/pagination.ts`). If the RPC
  returns more than 2,000 rows, render the first 2,000, show a visible notice above the list
  (`Members.ceiling` message, TR + EN: the list is incomplete, tell the admins), and `console.error` once with the count
  only (no personal data).
- The server passes the list (already mapped to `DirectoryMember`), the viewer's `safety` flag and the current safety
  filter state to a client component.

### Client (`"use client"`)

- Reads `q`, `side`, `page` from `useSearchParams()`; holds the search box value in state (controlled input), so the
  box never lags.
- **Search fold:** a TS port of `private.search_fold` (`lower(translate(value, 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu'))`,
  then contains-match on the trimmed query, max 60 chars as today) in a dependency-free module with `node --test` cases
  that mirror the SQL behaviour (İ/I/ı, ç/ğ/ö/ş/ü, mixed case, empty query). Fold every name once per list, not per
  keystroke.
- **Chips** (Tümü / Anadolu / Avrupa) are buttons (or links with `onClick` + `pushState`; builder's call, must stay
  keyboard-accessible and keep `aria-current`) whose counts reflect the search (as today: side counts honour the
  search, ignore the side).
- **Total line** ("N üye") and the empty states (`empty` vs `noResults`) behave as today.
- Renders the current page's 25 `MemberCard`s and the new `Pager` (§3). `MemberCard` contains `SafetyCardDialog`
  (a client component) and uses `useFormatter`/`useTranslations`: check it renders inside a client tree (next-intl
  client provider/messages available) or adapt.
- The search form keeps `role="search"`; Enter does nothing harmful (prevent the GET submit; the list already updated).
  The search icon button may go (no submit needed) — keep the input's `aria-label`.
- No JS: the page must still render the server-provided first page (SSR of the client component with the URL state);
  filtering without JS is not required.

### Skeleton

`DirectorySkeleton` gets a pager row matching the new pager's height. With approach A the skeleton only shows on the
first load / safety-filter navigation / language switch, not on search or chips. Measure as usual
(`docs/learnings/testing.md`, `data-skeleton` attributes), incl. a language switch back.

## 2. `/admin/members`

- Same pattern: the server (`requirePermission("members.manage")`) loads **all profiles** (every status, up to the
  ceiling + 1, in 1,000-row `.range()` chunks) with the columns used today (`id, full_name, avatar_url, status, created_at, role_id,
  member_contacts(email)`), ordered `created_at desc, id desc`, plus roles and the pending-application flags for the
  pending ones (`pending_application_flags` takes the ids; one call for all pending ids).
- Client: status chips (counts per status, derived from the loaded list; `countMembersByStatus` becomes dead), search
  by name (same fold as §1; also matching the email is a nice-to-have, builder may add it), 25 per page, the new
  pager, URL `?status=active&q=…&page=2` with defaults dropped.
- `MemberRow` actions (role, status, rename) are Server Actions that call `refresh()`: the server re-renders and the
  client receives the new full list; the URL state (and so the current tab/search/page) must survive that refresh. If a
  status change moves the row to another tab and the page is now past the end, the clamp from "Claude's calls" applies.
- Same ceiling notice + log (all profiles, not only active, count towards it).
- `pendingHint` stays on the pending tab.

## 3. Pager component

- One component used by all three lists, numbered style from the mockup: `‹` and `›` as outlined icon buttons (dimmed
  and `aria-disabled` at the ends), page numbers as ghost buttons, the current page filled with `bg-primary
  text-primary-foreground` and `aria-current="page"`, "…" as plain muted text. Items: first, last, current ±1; the gap
  "…" replaces a single hidden page only if it saves space (i.e. never `1 … 3`, show `1 2 3`). Fits one row at 390px
  for any page count (worst case: `‹ 1 … 13 14 15 … 80 ›` = 7 items + 2 arrows at 36px).
- Range line under it: "51–75 / 148 üye" (`Pagination.range` with an ICU plural-aware noun per list: members /
  applications; TR + EN). With a single page the button row is hidden and the range line stays (it is the total).
- Two flavours of the same markup: **client** (buttons calling `pushState` for `/members` and `/admin/members`) and
  **link** (`Link` from `@/i18n/navigation` with `?page=N` for `/admin/applications`). A pure, dependency-free helper
  computes the item list (`pageItems(current, total)` → numbers and gaps) with `node --test` cases.
- `nav` with `aria-label` (`Pagination.label`); the old `Pagination.next` / `Pagination.first` messages and the old
  `Pager` are removed.

## 4. `/admin/applications` (server, offset pages)

- `?page=N` (1-based) with `.range((N-1)*25, N*25-1)` and `count: "exact"` for the total, same filter tabs and order
  (`created_at desc, id desc`). Status-tab counts as today (`countApplicationsByStatus`); the total for the current tab
  can come from that same count — builder's call, avoid a duplicate query.
- Out-of-range page → redirect (or render) to the last page; `page=1` and garbage are dropped from links.
- Link pager (§3). Tab links drop `page`.

## 5. Conventions and cleanup

- **CLAUDE.md** "Lists use keyset pagination…" and "Every list paginates…" become: lists either load fully on the server
  up to `LIST_CEILING` (2,000) and filter/paginate in the browser, failing loudly above it (`/members`,
  `/admin/members`), or paginate on the server with offset pages (`?page=N`) when they grow without bound
  (`/admin/applications`); no silent caps; visible totals. Keyset stays only where a "load more" over a changing set is
  needed (`findLinkableAccounts`).
- **`src/lib/pagination.ts`:** remove what becomes dead (`decodeNameCursor`, `encodeNameCursor`, `NameCursor`,
  `afterCursorFilter`, `splitPage` if unused, `ilikeContains` if unused) and their tests; keep `encodeCursor` /
  `decodeCursor` / `toPage` for `findLinkableAccounts`. Add the ceiling constant, the page-param parser and
  `pageItems`.
- Dead after this: `countDirectory`, `countMembersByStatus`, `listMembers`' cursor/query arguments,
  `listApplications`' cursor argument, `Pager`, `Pagination.next/first`, `member_directory_counts`.
- **`docs/follow-ups.md`:** remove the "List UX iteration" item; keep a short item "Caching for lists: measure first"
  with the RLS-bypass reasoning and the Redis note; add anything else deferred (e.g. applications search).
- **`docs/learnings/`:** add entries for anything non-obvious — at least `supabase.md`: "`max_rows` (1,000) silently
  truncates selects and set-returning RPCs → read in `.range()` chunks with a total order" — and e.g. `pushState` +
  `useSearchParams` behaviour under Cache Components, SSR of URL state.

## 6. Tests and verification

- Unit (`node --test`): search fold (mirrors SQL), `pageItems`, page-param parsing/clamping, URL building (defaults
  dropped), the chunked reader (`readAll`: short chunk, exactly 1,000, exactly 2,000, 2,001 → ceiling hit).
- pgTAP: new `member_directory` signature (one overload), unchanged permission and visibility tests,
  `member_directory_counts` gone.
- E2E (`scripts/e2e/members-e2e.mjs`, `safety-e2e.mjs`, new or extended admin script): typing filters without a
  network request to the page (assert no RSC/document request), chips, URL contents (no `q=` when empty, no `cursor`),
  reload restores the view, back button after chip/page clicks, pager at 390px (one row, no horizontal overflow),
  safety filter still logs and keeps `q`/`side`, admin action keeps tab/search/page. Fixtures: more than 25 members are
  needed to see a second page — the E2E creates or seeds enough fixture profiles (README) rather than relying on real
  data.
- Skeleton measurements for the changed skeletons (§1), light + dark, TR + EN.
