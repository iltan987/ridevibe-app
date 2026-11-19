# Security learnings

### Prefix checks on redirect targets are bypassable with tabs/newlines (2026-11-08)
- **Symptom:** `safeNextPath` blocked `//evil` and `/\evil`, yet `?next=/%09/evil.example` redirected to
  `https://evil.example` after sign-in (open redirect).
- **Cause:** WHATWG URL parsing (browsers, Node `new URL`) silently removes ASCII tab/CR/LF before parsing, so
  `/\t/evil.example` becomes the protocol-relative `//evil.example`. String checks see a harmless path.
- **Do:** validate redirect targets by parsing them (`new URL(next, base)`), require `origin === base`, and use the
  **normalized** `pathname + search + hash` afterwards. See `src/lib/auth/safe-next.ts` (+ `.test.ts`).
- **Source:** found in code review; verified with Node 24.

### Google blocks OAuth in in-app browsers (2026-11-09)
- **Symptom:** applicants coming from Instagram/Facebook/TikTok get `403 disallowed_useragent` on "Sign in with Google".
- **Cause:** Google's policy forbids OAuth in embedded webviews; those apps open links in their own webview.
- **Do:** detect the in-app browser from the user agent and tell the user to open the page in Safari/Chrome
  (`src/components/auth/in-app-browser-notice.tsx`, detection in `src/lib/auth/in-app-browser.ts` with unit tests).
  Keep the Google button (detection can miss). Never force sign-in before the public application form.
- **Source:** community reports, e.g.
  https://community.auth0.com/t/403-disallowed-useragent-for-web-login-from-embedded-browsers/55074 and
  https://web3auth.io/community/t/web3auth-login-is-blocked-by-google-when-trying-to-access-via-instagram-browser/10355
  (more in the application-gaps spec).

### Show staff *which* account an approval activates (2026-11-09)
- **Risk:** approving an application linked to an account (`profile_id`) activates that account. Anyone signed in
  with any Google account can submit a real person's name and phone; staff confirm on WhatsApp with the real person,
  and the wrong account becomes a member. The account's Google display name is owner-controlled, so it proves nothing.
- **Do:** show the linked account's sign-in email to every decider (`application_account()` RPC, not the RLS-filtered
  profile embed), warn when it differs from the application email (compare normalised: `normalizeEmail` in
  `src/lib/applications/contact.ts` mirrors `private.normalize_email`), and name that email in the approve dialog.
- **Source:** final review of the application-gaps branch.

### Activating an account by hand made its application unlinkable (2026-11-10)
- **Symptom:** staff couldn't find a member in "Link to account"; she had put her iCloud address on the form and
  signed in with Gmail. Production had 7 approved-but-unlinked applications and 7 active accounts without one.
- **Cause:** `linkable_accounts` / `link_application` only accepted *pending* accounts (linking was the way to
  activate). Her account had been activated directly (Members page), so it could never be linked afterwards.
- **Do:** approved applications may also be linked to active accounts without an application (attach only, no
  status/name/role change; new/contacted still pending-only; inactive never). When a rule protects a state change,
  check what happens if staff reach the end state another way.
- **Source:** found by investigating production (read-only queries), 2026-11-10.

### Real people's data copied into docs and tests ended up in the public history (2026-11-19)
- **Symptom:** the history audit after the repo went public found a company name staff had typed on
  production, a real member's name (in the name-tidy examples, pgTAP tests and an invite example) and an
  unknown person's mobile number (the "valid mobile" test value) in learnings, specs, schema comments and tests.
- **Cause:** a bug report or a hand fix was quoted verbatim into a learning/spec, and the example then spread into
  tests and comments; a "realistic" phone number was typed from memory.
- **Do:** never copy a value from production or from a user's message into the repo: rewrite it as a placeholder
  before writing (names: Ali Veli / Ayşe Yılmaz; phones: `+90532 123 45 67`-style or `+90500…`; emails: `.invalid`).
  If one slips in, scrub history (`docs/learnings/tooling.md`, "Scrubbing text from history").
- **Source:** public-repo audit, 2026-11-19 (gitleaks + manual scans).
