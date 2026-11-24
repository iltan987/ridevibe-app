// Shared helpers for local browser E2E (see docs/learnings/testing.md). Local demo keys only.
import crypto from "node:crypto";
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
const MAILPIT = "http://127.0.0.1:54324";

/** `scrollbars: true` keeps classic (space-taking) scrollbars; puppeteer hides them by default in headless mode.
 *  `args` are extra Chrome command-line flags (e.g. `--bypass-app-banner-engagement-checks`). */
export async function launch({ scrollbars = false, args = [] } = {}) {
  return puppeteer.launch({
    executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
    args: ["--no-sandbox", "--accept-lang=tr", ...args],
    ...(scrollbars ? { ignoreDefaultArgs: ["--hide-scrollbars"] } : {}),
  });
}

/** New page at 390×844 (or given viewport), Turkish, without the browser's HTTP cache. Locally `next start` sends
 *  prerendered pages with `s-maxage=…, stale-while-revalidate=…` (Vercel strips both, browsers there get `max-age=0`):
 *  Chrome then serves them from its cache and revalidates in the background, and those requests never report
 *  finished, so `networkidle0` would hang (docs/learnings/testing.md). */
export async function newPage(browserOrContext, viewport = { width: 390, height: 844 }) {
  const page = await browserOrContext.newPage();
  await page.setCacheEnabled(false);
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

/** Signs in through the app's real `/auth/callback?code=…&next=…` (like Google sign-in, PKCE): requests a magic link
 *  with our own code challenge, reads it from the local Mailpit, follows it to get the one-time `code`, plants the
 *  code-verifier cookie that `exchangeCodeForSession` reads, then opens the callback. Clears Mailpit's inbox.
 *  Returns the page's final URL. Needs local email sign-in (docs/learnings/testing.md). */
export async function signInViaCallback(page, email, next, baseUrl = "http://localhost:3123") {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  const redirectTo = `${baseUrl}/auth/callback?next=${encodeURIComponent(next)}`;
  const otp = await fetch(`${API}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: false, code_challenge: challenge, code_challenge_method: "s256" }),
  });
  if (!otp.ok) throw new Error(`magic link failed for ${email}: ${otp.status}`);
  let link = null;
  for (let i = 0; i < 50 && !link; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const { messages = [] } = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const m = messages.find((x) => x.To?.some((t) => t.Address === email));
    if (m)
      link = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()).Text.match(
        /https?:\/\/\S+\/verify\?\S+/,
      )?.[0];
  }
  if (!link) throw new Error(`no magic link mail for ${email}`);
  const verify = await fetch(link, { redirect: "manual" });
  const code = new URL(verify.headers.get("location") ?? "", baseUrl).searchParams.get("code");
  if (!code) throw new Error(`magic link gave no code: ${verify.status}`);
  const { hostname } = new URL(baseUrl);
  const value = "base64-" + stringToBase64URL(JSON.stringify(verifier));
  await page.setCookie({ name: "sb-127-auth-token-code-verifier", value, domain: hostname, path: "/" });
  await page.goto(`${redirectTo}&code=${encodeURIComponent(code)}`, { waitUntil: "networkidle0" });
  return page.url();
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

/** Counts the requests that go to the server for a page: documents and RSC fetches (incl. prefetches). Other requests
 *  don't count: Chrome refetches the favicon on every History API URL change (docs/learnings/testing.md). */
export function watchServer(page, baseUrl = "http://localhost:3123") {
  let seen = [];
  page.on("request", (r) => {
    const url = r.url();
    if (r.resourceType() === "document" || url.includes("_rsc=") || r.headers()["rsc"])
      seen.push(`${r.resourceType()} ${url.replace(baseUrl, "")}`);
  });
  return { reset: () => (seen = []), count: () => seen.length, list: () => seen };
}

/** The visible pager's button row (`nav[data-skeleton-result=pager]`): on one line, inside the page, and no sideways
 *  scrolling anywhere. */
export const pagerFit = (page) =>
  page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav[data-skeleton-result=pager]")].find(
      (n) => n.getBoundingClientRect().width > 0,
    );
    const row = nav?.querySelector("div");
    if (!row) return { found: false };
    const tops = new Set([...row.children].map((c) => Math.round(c.getBoundingClientRect().top)));
    const r = row.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      oneRow: tops.size === 1,
      fits: r.left >= 0 && r.right <= document.body.clientWidth && doc.scrollWidth <= doc.clientWidth,
      items: row.children.length,
      left: Math.round(r.left),
      right: Math.round(r.right),
      width: Math.round(r.width),
      body: document.body.clientWidth,
    };
  });

/** Clears the visible search box (`input[type=search]`) and types `value` with no delay between keys. */
export async function clearAndType(page, value) {
  const input = (
    await page.evaluateHandle(
      () =>
        [...document.querySelectorAll("input[type=search]")].find((e) => e.getBoundingClientRect().width > 0) ?? null,
    )
  ).asElement();
  if (!input) throw new Error("no visible search box");
  await input.focus();
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await input.type(value, { delay: 0 });
}
