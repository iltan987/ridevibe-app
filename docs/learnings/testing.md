# Testing learnings

### Browser E2E without adding a framework to the repo (2026-11-07)
- **Do:** install `puppeteer-core` in the session scratchpad (not the project) and drive the system Chrome at
  `/usr/bin/google-chrome` (`--no-sandbox`, viewport 390×844 for phones, `Accept-Language: tr`).
- Quick checks without scripts: `google-chrome --headless=new --dump-dom` / `--screenshot` with
  `--virtual-time-budget=6000`. Headless Chrome is English unless `--accept-lang=tr`.
- **Gotcha:** never wait for text that may already be on the page from a previous step (a test "found" the old error
  banner and reported failure while the submit actually succeeded). Wait for the submit button to re-enable or for
  a state that only the new result produces.

### Testing as a signed-in user locally (2026-11-07)
- Google OAuth can't be automated and local JWTs are ES256 (can't be minted). Workaround:
  1. `pnpm exec supabase stop && SUPABASE_AUTH_EMAIL_ENABLED=true pnpm exec supabase start` (temporary, env only)
  2. create users via `POST /auth/v1/admin/users` with the local secret key, `email_confirm: true`, a password
  3. set role/status with SQL (`docker exec supabase_db_ridevibe psql -U postgres …`)
  4. `POST /auth/v1/token?grant_type=password` → session; cookie via `@supabase/ssr` internals:
     `createChunks("sb-127-auth-token", "base64-" + stringToBase64URL(JSON.stringify(session)))`
     (`require` from the project's `node_modules/@supabase/ssr/dist/main/utils/…`)
  5. restart the stack normally afterwards (email sign-in off again).
- Local test users that exist now: `organizer@test.local`, `member@test.local` (password `test-password-123`).

### Validating pure TS logic quickly (2026-11-07)
- `npx --yes tsx --tsconfig tsconfig.json script.ts` works (path aliases resolve). `pnpm dlx tsx` fails under
  pnpm 12 because esbuild's build script is blocked.

### Check access control in three roles (2026-11-07)
- Every staff page: signed-out → sign-in redirect, member → 404, organizer/admin → content. The DB tests cover the
  same rules at the data level.

### Smoke-testing production safely (2026-11-08)
- Preview deployments are behind Vercel login (puppeteer can't pass it without a bypass secret); production is public.
- **Do:** after merging, run the browser E2E against `https://ridevibe.com.tr` with an `@pgtap.invalid` email and a
  `utm_campaign=smoke-test`, verify the row via `POSTGRES_URL_NON_POOLING` (`docker run --rm postgres:17-alpine
  psql "$URL" …`), then delete it.
