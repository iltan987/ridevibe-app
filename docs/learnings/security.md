# Security learnings

### Prefix checks on redirect targets are bypassable with tabs/newlines (2026-11-08)
- **Symptom:** `safeNextPath` blocked `//evil` and `/\evil`, yet `?next=/%09/evil.example` redirected to
  `https://evil.example` after sign-in (open redirect).
- **Cause:** WHATWG URL parsing (browsers, Node `new URL`) silently removes ASCII tab/CR/LF before parsing, so
  `/\t/evil.example` becomes the protocol-relative `//evil.example`. String checks see a harmless path.
- **Do:** validate redirect targets by parsing them (`new URL(next, base)`), require `origin === base`, and use the
  **normalized** `pathname + search + hash` afterwards. See `src/lib/auth/safe-next.ts` (+ `.test.ts`).
- **Source:** found in code review; verified with Node 24.
