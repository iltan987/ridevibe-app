// "Başvur" visibility E2E: the desktop nav, the phone tab bar and the home hero and closing section offer /apply exactly when /apply would
// show the form, and on a second load nothing moves between first paint and the settled page (the static shell guesses
// from the session cookie + localStorage "rv-apply-hidden", the streamed parts know).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123), local email sign-in and the fixture users
// member@test.local (active), pending-noapp@test.local (pending, no application) and pending-app@test.local (pending,
// one linked application with status new/contacted); see scripts/e2e/README.md.
// The last scenario sends applications as pending-noapp@test.local and as a visitor (apply-nav-e2e@test.local) and
// deletes them before and after through `docker exec … psql` (local DB only).
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123), DB_CONTAINER (default supabase_db_ridevibe).
import { execFileSync } from "node:child_process";
import { launch, newPage, signIn, throttle } from "./e2e-lib.mjs";
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const VISITOR_EMAIL = "apply-nav-e2e@test.local";
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
    const hero = [...document.querySelectorAll("main [data-home-hero]")].find(vis);
    const closing = [...document.querySelectorAll("main [data-home-closing]")].find(vis);
    // (the closing section is the page's last: once parsed, the hero and both buttons' guesses are in the document)
    if (nav && hero && closing) {
      const tabs = bottom ? [...bottom.querySelectorAll("a")].filter(vis) : [];
      const f = {
        tabs: tabs.length,
        xs: tabs.map((a) => Math.round(a.getBoundingClientRect().x)),
        tabApply: tabs.some((a) => a.hasAttribute("data-apply-link")),
        hero: [...hero.querySelectorAll("[data-apply-link]")].some(vis),
        closing: [...closing.querySelectorAll("[data-apply-link]")].some(vis),
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
const layoutKey = (f) => JSON.stringify([f.tabs, f.xs, f.tabApply, f.hero, f.closing, f.desktop]);
const layouts = (frames) => [...new Set(frames.map(layoutKey))];
const fmt = (frames) => frames.map((f) =>
  `${f.guess ? "guess" : "real"}:${f.tabs ? `${f.tabs}tabs${f.tabApply ? "+B" : ""}@${f.xs.join("/")}` : "-"} hero=${+f.hero} end=${+f.closing} desk=${+f.desktop}`).join(" → ");
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
  return nav && f.hero === show && f.closing === show && !f.guess;
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

// 5. Sending an application: signed in, "Başvur" disappears at once while the success card stays (no reload; the
//    action doesn't refresh()); a signed-out visitor keeps it (the spec's table: visitors always see it).
const sql = (q) => execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();
const deleteApplications = () => sql(`delete from applications where email in ('pending-noapp@test.local', '${VISITOR_EMAIL}')`);
async function find(page, selector, text = "") {
  const h = await page.evaluateHandle((selector, text) => [...document.querySelectorAll(selector)]
    .find((e) => e.getBoundingClientRect().width > 0 && (!text || e.textContent.trim() === text)) ?? null, selector, text);
  const el = h.asElement();
  if (!el) throw new Error(`no visible ${selector} ${text}`);
  await el.evaluate((b) => b.scrollIntoView({ block: "center" })); // the fixed tab bar would eat the click
  return el;
}
const tap = async (page, selector, text = "") => { await (await find(page, selector, text)).click(); await sleep(80); };
async function type(page, selector, value) {
  const el = await find(page, selector);
  await el.focus();
  await el.evaluate((i) => i.select());
  await el.press("Backspace");
  await el.type(value);
}
const choose = (page, field, text) => tap(page, `[data-field="${field}"] label`, text);
async function next(page, to) {
  await tap(page, "button[type=submit]", "Devam");
  await page.waitForFunction((n) => [...document.querySelectorAll("[data-step]")].some((e) => !e.hidden && Number(e.dataset.step) === n), { timeout: 8000 }, to);
}
/** Fills the four steps (answers as in apply-e2e.mjs) and sends the form. */
async function sendApplication(page, email) {
  await choose(page, "license_class", "A2");
  await type(page, "input[name=riding_years]", "5");
  await choose(page, "owns_motorcycle", "Hayır");
  await choose(page, "riding_styles", "Şehir içi");
  await choose(page, "group_experience", "Biraz");
  await next(page, 2);
  await choose(page, "in_other_clubs", "Hayır");
  await choose(page, "heard_from", "Instagram reklamı");
  await choose(page, "event_interests", "Kamp");
  await next(page, 3);
  for (const name of ["expectations", "alienating_behaviors", "conflict_handling"]) await type(page, `textarea[name=${name}]`, "Birlikte güvenli sürüşler yapmak istiyorum.");
  await next(page, 4);
  await type(page, "input[name=full_name]", "Apply Nav Testkisi");
  await type(page, "input#phone", "5321234567");
  if (email) await type(page, "input[name=email]", email);
  await page.evaluate(() => {
    const input = document.querySelector("input[name=birth_date]");
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, "1990-05-17");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.select("select#district", "Kadıköy");
  await choose(page, "languages", "Türkçe");
  for (const name of ["consent_privacy", "consent_rules"]) await tap(page, `[data-field="${name}"] [role=checkbox]`);
  await tap(page, "button[type=submit]", "Başvuruyu gönder");
  await page.waitForFunction(() => document.body.innerText.includes("Başvurun alındı!"), { timeout: 15000 });
}
const navState = (page) => page.evaluate(() => {
  const vis = (e) => !!e && e.getBoundingClientRect().width > 0;
  const bottom = [...document.querySelectorAll("nav.fixed")].find(vis);
  return {
    tabs: bottom ? [...bottom.querySelectorAll("a")].filter(vis).length : null,
    apply: [...document.querySelectorAll("nav [data-apply-link]")].some(vis),
    success: document.body.innerText.includes("Başvurun alındı!"),
    hint: localStorage.getItem("rv-apply-hidden"),
    url: location.pathname,
  };
});
const fmtNav = (s) => `${s.tabs === null ? "desktop" : s.tabs + " tabs"}${s.apply ? " +Başvur" : ""} success=${s.success} hint=${s.hint} ${s.url}`;
deleteApplications();
try {
  for (const [who, viewport] of [["pending-noapp", "phone"], ["pending-noapp", "desktop"], ["visitor", "phone"]]) {
    const signedIn = who !== "visitor";
    const { ctx, page } = await fresh(who, viewport);
    await page.goto(BASE + "/apply", { waitUntil: "networkidle0" });
    await sleep(500);
    const before = await navState(page);
    await page.evaluate(() => { window.__sameDocument = true; }); // gone if the page reloads
    await sendApplication(page, signedIn ? null : VISITOR_EMAIL);
    // Signed in: hidden at once (allow a few frames); visitor: give a wrong hide the same time to show up.
    const t0 = Date.now();
    let after = await navState(page);
    while (Date.now() - t0 < 2000 && (signedIn ? after.apply : true)) { await sleep(100); after = await navState(page); }
    const reloaded = !(await page.evaluate(() => window.__sameDocument === true));
    const rows = Number(sql(`select count(*) from applications where email = '${signedIn ? "pending-noapp@test.local" : VISITOR_EMAIL}'`));
    const hiddenOk = viewport === "phone" ? after.tabs === 4 && !after.apply : !after.apply;
    const shownOk = viewport === "phone" ? after.tabs === 5 && after.apply : after.apply;
    check(`${who} ${viewport}: application sent — ${signedIn ? "Başvur gone without a reload, success card stays" : "Başvur stays (visitors always see it)"}`,
      before.apply && rows === 1 && after.success && !reloaded && (signedIn ? hiddenOk && after.hint === "1" : shownOk && after.hint !== "1"),
      `before: ${fmtNav(before)}; after: ${fmtNav(after)}; rows=${rows} reloaded=${reloaded}`);
    deleteApplications();
    await ctx.close();
  }
} finally {
  deleteApplications();
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
