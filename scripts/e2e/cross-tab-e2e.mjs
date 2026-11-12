// Cross-tab sync E2E: signing in/out, switching account and switching language in one tab updates the other open
// tabs (src/lib/cross-tab.ts, AuthSync, LocaleSwitcher), including tabs loaded in the background (they hydrate only
// when shown) and a store that already holds the target language. All tabs share one browser context.
// Needs `pnpm start -p 3123`, local email sign-in and two active users: `member@test.local` and `second@test.local`
// (names with different initials; docs/learnings/testing.md "Testing as a signed-in user locally").
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123).
import { launch, newPage, signIn } from "./e2e-lib.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await launch();

// Next keeps the previous route's tree hidden in the DOM: always pick the visible element.
async function visible(page, sel, text = "") {
  const h = await page.evaluateHandle(
    (sel, text) =>
      [...document.querySelectorAll(sel)].find(
        (e) => e.getBoundingClientRect().width > 0 && (!text || e.textContent.includes(text)),
      ) ?? null,
    sel,
    text,
  );
  return h.asElement();
}
/** Opens a header dropdown and clicks an item (role + text). Background tabs don't take clicks: bring to front. */
async function menu(page, triggerSel, itemSel, itemText) {
  await page.bringToFront();
  for (let i = 0; i < 5; i++) {
    const trigger = await visible(page, triggerSel);
    if (trigger) await trigger.click();
    await sleep(400);
    const item = await visible(page, itemSel, itemText);
    if (item) return item.click();
    await page.keyboard.press("Escape");
    await sleep(300);
  }
  throw new Error(`could not pick "${itemText}" from ${triggerSel}`);
}
const signOutVia = (page) =>
  menu(page, '[data-skeleton-result="user-menu"]', '[role="menuitem"]', "Çıkış Yap");
const switchLanguageVia = (page, label) =>
  menu(page, '[data-skeleton-result="locale-switcher"]:not([disabled])', '[role="menuitemradio"]', label);

const where = (page) => {
  const u = new URL(page.url());
  return u.pathname + u.search;
};
/** Who the header shows: the avatar initials in the user-menu trigger, or "signed-out". The header lives in the layout
 *  (no hidden route copies). No visibility filter and not the menu's name label: a hidden tab keeps the skeleton on
 *  screen, the streamed trigger unrevealed (zero size) and the menu portal unmounted until the tab is shown. Fixture
 *  names must differ in their initials. */
const shownUser = (page) =>
  page.evaluate(() => {
    const trigger = document.querySelector('[data-skeleton-result="user-menu"]');
    if (!trigger) return "none";
    if (trigger.tagName === "A") return "signed-out";
    return trigger.textContent.trim() || "?";
  });
/** Polls until `fn()` is truthy (state in a background tab settles asynchronously). */
async function until(fn, ms = 6000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > end) return v;
    await sleep(150);
  }
}
/** The header's user once the user menu has streamed in. */
const settledUser = async (page) =>
  (await until(async () => !["none", "?"].includes(await shownUser(page)) && shownUser(page))) || "none";
const dropSession = async (page) =>
  page.deleteCookie(...(await page.cookies()).filter((c) => c.name.startsWith("sb-")));

/** Counts the RSC requests a tab makes (refreshes / navigations). */
function rscCounter(page) {
  let n = 0;
  page.on("request", (r) => {
    if (r.headers()["rsc"] === "1" && !r.headers()["next-router-prefetch"]) n++;
  });
  return { get: () => n, reset: () => (n = 0) };
}

const ctx = await browser.createBrowserContext();
const A = await newPage(ctx);
const B = await newPage(ctx);
const bRsc = rscCounter(B);

try {
  // --- Signed-out visitors leave no key behind.
  await A.goto(BASE + "/", { waitUntil: "networkidle0" });
  check("signed-out visit stores no rv-auth key", (await A.evaluate(() => localStorage.getItem("rv-auth"))) === null);
  // An old switch to English, as if from an earlier browser session (the store outlives the NEXT_LOCALE session
  // cookie). Written now, while no other tab listens, so nothing follows it.
  await A.evaluate(() => localStorage.setItem("rv-locale", "en@1"));

  // --- Sign out in A (real menu) while B, in the background, shows a private page.
  await signIn(A, "member@test.local", BASE);
  await A.goto(BASE + "/account", { waitUntil: "networkidle0" });
  const memberName = await settledUser(A);
  await B.goto(BASE + "/members", { waitUntil: "networkidle0" });
  check("B starts signed in on /members", where(B) === "/members" && (await settledUser(B)) === memberName, memberName);
  bRsc.reset();
  await signOutVia(A);
  await until(async () => where(A) === "/");
  const bAfterOut = await until(async () => where(B).startsWith("/sign-in") && where(B));
  check("sign-out in A sends background B to sign-in with next", bAfterOut === "/sign-in?next=%2Fmembers", where(B));
  await sleep(1500);
  check("B settles after one change (no refresh ping-pong)", bRsc.get() <= 2, `${bRsc.get()} RSC requests`);

  // --- Sign in in A while B shows /sign-in?next=/members: B follows next.
  await signIn(A, "member@test.local", BASE);
  await A.goto(BASE + "/account", { waitUntil: "networkidle0" });
  const bAfterIn = await until(async () => where(B) === "/members" && where(B));
  check("sign-in in A takes B from /sign-in to its next", bAfterIn === "/members", where(B));
  check("B's header shows the signed-in user", (await until(async () => (await shownUser(B)) === memberName)), await shownUser(B));

  // --- Switch account in A (sign out, sign in as someone else) while B stays on /members.
  await dropSession(A);
  await signIn(A, "second@test.local", BASE);
  await A.reload({ waitUntil: "networkidle0" });
  const secondName = await settledUser(A);
  const bSwitched = await until(async () => (await shownUser(B)) === secondName);
  check("account switch in A shows the new user in B", bSwitched && secondName !== memberName, `${memberName} → ${await shownUser(B)}`);

  // --- A tab frozen in the background catches up when it comes back.
  const cdp = await B.createCDPSession();
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" });
  await A.bringToFront();
  await signOutVia(A);
  await until(async () => where(A) === "/");
  await sleep(500);
  await cdp.send("Page.setWebLifecycleState", { state: "active" });
  await B.bringToFront();
  const bAfterFrozen = await until(async () => where(B).startsWith("/sign-in") && where(B));
  check("a frozen tab follows a sign-out once it is active again", bAfterFrozen === "/sign-in?next=%2Fmembers", where(B));

  // --- Signed in, `/sign-in?next=/sign-in` doesn't loop.
  await signIn(A, "member@test.local", BASE);
  await A.goto(BASE + "/sign-in?next=%2Fsign-in", { waitUntil: "networkidle0" });
  check("signed in, next=/sign-in lands on /account", where(A) === "/account", where(A));

  // --- A tab opened in the background mounts its header only when first shown, with an older render. Shown after a
  // sign-out elsewhere, it must refresh (not store its outdated user), and the next real sign-in must still reach it.
  const E = await newPage(ctx);
  await A.bringToFront();
  await E.goto(BASE + "/members", { waitUntil: "networkidle0" });
  check("E loaded in the background", (await E.evaluate(() => document.visibilityState)) === "hidden");
  await signOutVia(A);
  await until(async () => where(A) === "/");
  await sleep(500);
  await E.bringToFront();
  const eShown = await until(async () => where(E).startsWith("/sign-in") && where(E));
  check("a tab shown late after a sign-out goes to sign-in", eShown === "/sign-in?next=%2Fmembers", where(E));
  await sleep(1000);
  check("the late tab didn't store its outdated user", (await A.evaluate(() => localStorage.getItem("rv-auth")))?.startsWith("@"), await A.evaluate(() => localStorage.getItem("rv-auth")));
  await A.bringToFront();
  await signIn(A, "member@test.local", BASE);
  await A.goto(BASE + "/account", { waitUntil: "networkidle0" });
  const eAfterIn = await until(async () => where(E) === "/members" && where(E));
  check("the next sign-in still reaches the late tab", eAfterIn === "/members", where(E));
  await E.close();

  // --- Language: switch in A; B on /members?q=… follows (query kept), /apply and /account keep Turkish. The store
  // starts with an old switch to English (it outlives the NEXT_LOCALE session cookie): switching to English again must
  // still reach the other tabs (seeded at the start, while no other tab listened). B is hydrated, then hidden (follows
  // live); F loads in the background and is shown only after the switch (catches up when its header mounts).
  await B.bringToFront();
  await B.goto(BASE + "/members?q=Test", { waitUntil: "networkidle0" });
  await A.bringToFront();
  const F = await newPage(ctx);
  await A.bringToFront();
  await F.goto(BASE + "/members", { waitUntil: "networkidle0" });
  check("F loaded in the background", (await F.evaluate(() => document.visibilityState)) === "hidden");
  const C = await newPage(ctx);
  await C.goto(BASE + "/apply", { waitUntil: "networkidle0" });
  const D = await newPage(ctx);
  await D.goto(BASE + "/account", { waitUntil: "networkidle0" });
  await A.goto(BASE + "/", { waitUntil: "networkidle0" });
  await switchLanguageVia(A, "English");
  await until(async () => where(A) === "/en");
  const bEn = await until(async () => where(B) === "/en/members?q=Test" && where(B));
  check("language switch in A moves B to English, query kept", bEn === "/en/members?q=Test", where(B));
  check("B renders English", (await until(() => B.evaluate(() => document.documentElement.lang === "en"))) === true);
  await F.bringToFront();
  const fEn = await until(async () => where(F) === "/en/members" && where(F));
  check("a tab loaded in the background catches up when shown", fEn === "/en/members", where(F));
  await F.close();
  await sleep(1000);
  check("/apply keeps its language", where(C) === "/apply" && (await C.evaluate(() => document.documentElement.lang)) === "tr", where(C));
  check("/account keeps its language", where(D) === "/account" && (await D.evaluate(() => document.documentElement.lang)) === "tr", where(D));

  await switchLanguageVia(A, "Türkçe");
  const bTr = await until(async () => where(B) === "/members?q=Test" && where(B));
  check("switching back to Turkish moves B back", bTr === "/members?q=Test", where(B));
  check("the switching tab itself doesn't bounce", where(A) === "/", where(A));
} finally {
  await ctx.close();
  await browser.close();
}

console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
