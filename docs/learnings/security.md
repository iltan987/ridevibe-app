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
  (`src/components/auth/in-app-browser-notice.tsx`, detection in `src/lib/auth/in-app-browser.ts` with unit tests). Keep the Google
  button (detection can miss). Never force sign-in before the public application form.
- **Source:** Auth0 / Memberstack community reports (see the application-gaps spec).
