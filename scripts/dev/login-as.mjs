// Sign in as a local test user in your own browser (local stack only; local demo keys).
// Usage: node scripts/dev/login-as.mjs member@test.local
// Prints a snippet: paste it into the DevTools console on http://localhost:3000 (or :3123); the page reloads signed in.
// Needs local email sign-in (`SUPABASE_AUTH_EMAIL_ENABLED=true pnpm exec supabase start`) and the user to exist with
// the test password (docs/learnings/testing.md).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRequire = createRequire(path.join(REPO, "package.json"));
const { createChunks } = repoRequire("@supabase/ssr/dist/main/utils/chunker.js");
const { stringToBase64URL } = repoRequire("@supabase/ssr/dist/main/utils/base64url.js");

const API = "http://127.0.0.1:54321";
const PUBLISHABLE = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const COOKIE = "sb-127-auth-token";

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/dev/login-as.mjs <email>");
  process.exit(1);
}

const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: "test-password-123" }),
});
if (!res.ok) {
  console.error(`Sign-in failed for ${email}: ${res.status} ${await res.text()}`);
  console.error("Is email sign-in on? SUPABASE_AUTH_EMAIL_ENABLED=true pnpm exec supabase start");
  process.exit(1);
}
const session = await res.json();
const chunks = createChunks(COOKIE, "base64-" + stringToBase64URL(JSON.stringify(session)));

// Clears every existing chunk first (a leftover `.1` from a longer session would corrupt the new one).
const snippet = `(() => {
  for (const c of document.cookie.split("; ")) {
    const name = c.split("=")[0];
    if (name.startsWith(${JSON.stringify(COOKIE)})) document.cookie = name + "=; path=/; max-age=0";
  }
  for (const [name, value] of ${JSON.stringify(chunks.map((c) => [c.name, c.value]))}) {
    document.cookie = name + "=" + value + "; path=/; max-age=34560000; samesite=lax";
  }
  location.reload();
})();`;

console.log(`Paste into the DevTools console on the local app (signed in as ${email}):\n\n${snippet}\n`);
