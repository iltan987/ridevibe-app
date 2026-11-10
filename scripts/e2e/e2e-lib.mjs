// Shared helpers for local browser E2E (see docs/learnings/testing.md). Local demo keys only.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const repoRequire = createRequire(path.join(REPO, "package.json"));

// puppeteer-core is installed outside the repo: PUPPETEER_DIR=<dir containing node_modules/puppeteer-core>.
if (!process.env.PUPPETEER_DIR) {
  throw new Error("Set PUPPETEER_DIR to a directory with puppeteer-core installed (see scripts/e2e/README.md).");
}
const puppeteer = createRequire(path.join(path.resolve(process.env.PUPPETEER_DIR), "package.json"))("puppeteer-core");
const { createChunks } = repoRequire("@supabase/ssr/dist/main/utils/chunker.js");
const { stringToBase64URL } = repoRequire("@supabase/ssr/dist/main/utils/base64url.js");

const API = "http://127.0.0.1:54321";
const PUBLISHABLE = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";

export async function launch() {
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--accept-lang=tr"],
  });
}

/** New page at 390×844 (or given viewport), Turkish. */
export async function newPage(browserOrContext, viewport = { width: 390, height: 844 }) {
  const page = await browserOrContext.newPage();
  await page.setViewport(viewport);
  await page.setExtraHTTPHeaders({ "Accept-Language": "tr" });
  return page;
}

/** Sets the Supabase session cookies for a local test user (email sign-in must be enabled locally). */
export async function signIn(page, email, baseUrl = "http://localhost:3123") {
  const res = await fetch(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "test-password-123" }),
  });
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${res.status}`);
  const session = await res.json();
  const chunks = createChunks("sb-127-auth-token", "base64-" + stringToBase64URL(JSON.stringify(session)));
  const { hostname } = new URL(baseUrl);
  await page.setCookie(...chunks.map((c) => ({ name: c.name, value: c.value, domain: hostname, path: "/" })));
}

/** Slow mobile network via CDP. */
export async function throttle(page, { latency = 400, kbps = 400 } = {}) {
  const cdp = await page.createCDPSession();
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency,
    downloadThroughput: (kbps * 1024) / 8,
    uploadThroughput: (kbps * 1024) / 8,
  });
  return cdp;
}
