// "Başvur" visibility E2E: the desktop nav, the phone tab bar and the home hero offer /apply exactly when /apply would
// show the form, and on a second load nothing moves between first paint and the settled page (the static shell guesses
// from the session cookie + localStorage "rv-apply-hidden", the streamed parts know).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123), local email sign-in and the fixture users
// member@test.local (active), pending-noapp@test.local (pending, no application) and pending-app@test.local (pending,
// one linked application with status new/contacted); see scripts/e2e/README.md.
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123).
import { launch, newPage, signIn, throttle } from "./e2e-lib.mjs";
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const FIXTURES = {
  visitor: { email: null, show: true },
  member: { email: "member@test.local", show: false },
  "pending-noapp": { email: "pending-noapp@test.local", show: true },
  "pending-app": { email: "pending-app@test.local", show: false },
};
const VIEWPORTS = { phone: { width: 390, height: 844 }, desktop: { width: 1280, height: 800 } };

const browser = await launch();

async function fresh(who, viewport, { before } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, VIEWPORTS[viewport]);
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  if (before) await page.evaluateOnNewDocument(before);
  await page.evaluateOnNewDocument(frameLogger);
  if (FIXTURES[who].email) await signIn(page, FIXTURES[who].email, BASE);
  return { ctx, page, pageErrors };
}

// Logs, on every animation frame where it changes, what is visible: the bottom-nav tabs (count, x of each, whether
// "Başvur" is among them), the hero's "Başvur" and the desktop "Başvur". Frames before the nav and the hero are parsed
// are skipped. `guess` = the visible nav is the static-shell guess (followed by its apply-hint script), not the
// streamed nav.
function frameLogger() {
  window.__frames = [];
  let last = "";
  const tick = () => {
    const vis = (e) => !!e && e.getBoundingClientRect().width > 0;
    const bottom = [...document.querySelectorAll("nav.fixed")].find(vis);
    const desktop = [...document.querySelectorAll("header nav")].find(vis);
    const nav = bottom ?? desktop;
    const heroEvents = [...document.querySelectorAll('main a[href$="/events"]')].find(vis);
    if (nav && heroEvents) {
      const tabs = bottom ? [...bottom.querySelectorAll("a")].filter(vis) : [];
      const f = {
        tabs: tabs.length,
        xs: tabs.map((a) => Math.round(a.getBoundingClientRect().x)),
        tabApply: tabs.some((a) => a.hasAttribute("data-apply-link")),
        hero: [...document.querySelectorAll("main [data-apply-link]")].some(vis),
        desktop: !!desktop && [...desktop.querySelectorAll("[data-apply-link]")].some(vis),
        // (the streamed tab bar is the last element of <body>, followed by Next's own streaming scripts)
        guess: nav.nextElementSibling?.tagName === "SCRIPT" && nav.nextElementSibling.textContent.includes("rv-apply-hidden"),
      };
      const k = JSON.stringify(f);
      if (k !== last) { window.__frames.push(f); last = k; }
    }
    if (performance.now() < 30000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const layoutKey = (f) => JSON.stringify([f.tabs, f.xs, f.tabApply, f.hero, f.desktop]);
const layouts = (frames) => [...new Set(frames.map(layoutKey))];
const fmt = (frames) => frames.map((f) =>
  `${f.guess ? "guess" : "real"}:${f.tabs ? `${f.tabs}tabs${f.tabApply ? "+B" : ""}@${f.xs.join("/")}` : "-"} hero=${+f.hero} desk=${+f.desktop}`).join(" → ");
const frames = (page) => page.evaluate(() => window.__frames);
// Keeps the current frame, so the next log starts from what is on screen now.
const resetFrames = (page) => page.evaluate(() => { window.__frames = window.__frames.slice(-1); });
async function load(page, path) {
  await page.goto(BASE + path, { waitUntil: "networkidle0" });
  await sleep(1000);
  return frames(page);
}

/** The settled (last) frame matches the fixture: phone 5/4 tabs, hero and desktop link shown/hidden. */
function settledOk(viewport, show, f) {
  if (!f) return false;
  const nav = viewport === "phone" ? f.tabs === (show ? 5 : 4) && f.tabApply === show : f.desktop === show;
  return nav && f.hero === show && !f.guess;
}

// Next keeps the previous route's tree hidden in the DOM: always pick the visible element.
async function visible(page, sel, text = "") {
  const h = await page.evaluateHandle((sel, text) => [...document.querySelectorAll(sel)]
    .find((e) => e.getBoundingClientRect().width > 0 && (!text || e.textContent.includes(text))) ?? null, sel, text);
  return h.asElement();
}
async function switchLanguage(page) {
  for (let i = 0; i < 5; i++) {
    const trigger = await visible(page, '[data-skeleton-result="locale-switcher"]:not([disabled])');
    if (trigger) await trigger.click();
    await sleep(400);
    const item = await visible(page, '[role="menuitemradio"]:not([aria-checked="true"])');
    if (item) { await item.click(); return; }
    await page.keyboard.press("Escape");
    await sleep(300);
  }
  throw new Error("could not switch the language");
}

// 1. Settled state and second loads (TR, then EN), phone and desktop, every fixture. The first load stores the answer.
for (const viewport of Object.keys(VIEWPORTS)) {
  for (const [who, { show }] of Object.entries(FIXTURES)) {
    const { ctx, page } = await fresh(who, viewport);
    const first = await load(page, "/");
    check(`${who} ${viewport}: settled state (${show ? "Başvur shown" : "no Başvur"})`, settledOk(viewport, show, first.at(-1)), fmt(first));
    await throttle(page, { latency: 300, kbps: 2000 }); // keeps the guess on screen long enough to be seen
    for (const path of ["/", "/en"]) {
      const lang = path === "/" ? "TR" : "EN";
      const second = await load(page, path);
      check(`${who} ${viewport} ${lang}: second load, one layout from first paint to settled`,
        layouts(second).length === 1 && settledOk(viewport, show, second.at(-1)), fmt(second));
      check(`${who} ${viewport} ${lang}: second load showed the guess first (test is meaningful)`, second[0]?.guess === true, fmt(second));
    }
    await ctx.close();
  }
}

// 2. Language switch and back (second load): the [locale] layout remounts and the switch back re-shows the fallback,
//    rendered on the client (useApplyHiddenGuess).
for (const viewport of Object.keys(VIEWPORTS)) {
  for (const who of ["member", "pending-noapp"]) {
    const { show } = FIXTURES[who];
    const { ctx, page } = await fresh(who, viewport);
    await load(page, "/");
    await load(page, "/");
    await throttle(page, { latency: 300, kbps: 2000 });
    await resetFrames(page);
    await switchLanguage(page);
    await page.waitForFunction(() => document.documentElement.lang === "en", { timeout: 15000 });
    await sleep(2500);
    await switchLanguage(page);
    await page.waitForFunction(() => document.documentElement.lang === "tr", { timeout: 15000 });
    await sleep(2500);
    const sw = await frames(page);
    check(`${who} ${viewport}: language switch and back, one layout`, layouts(sw).length === 1 && settledOk(viewport, show, sw.at(-1)), fmt(sw));
    if (!sw.some((f) => f.guess)) console.log(`INFO ${who} ${viewport}: the fallback was not re-shown in this run — ${fmt(sw)}`);
    await ctx.close();
  }
}

// 3. A visitor with a stale "1" (e.g. signed out since) still sees "Başvur" from the first frame: no session cookie.
for (const viewport of Object.keys(VIEWPORTS)) {
  const { ctx, page } = await fresh("visitor", viewport, { before: () => localStorage.setItem("rv-apply-hidden", "1") });
  await throttle(page, { latency: 300, kbps: 2000 });
  const fr = await load(page, "/");
  check(`visitor ${viewport} with stored "1": Başvur from the first frame`,
    fr.length > 0 && fr.every((f) => settledOk(viewport, true, { ...f, guess: false })) && settledOk(viewport, true, fr.at(-1)), fmt(fr));
  await ctx.close();
}

// 4. localStorage blocked (privacy settings): no page error, the settled state is still right.
for (const viewport of Object.keys(VIEWPORTS)) {
  const block = () => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("blocked", "SecurityError"); } });
  const { ctx, page, pageErrors } = await fresh("member", viewport, { before: block });
  const fr = await load(page, "/");
  const blocked = await page.evaluate(() => { try { return !window.localStorage; } catch { return true; } });
  check(`member ${viewport}, localStorage blocked: no page error, settled state right`,
    blocked && pageErrors.length === 0 && settledOk(viewport, false, fr.at(-1)), `blocked=${blocked} errors=${JSON.stringify(pageErrors)} ${fmt(fr)}`);
  await ctx.close();
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
