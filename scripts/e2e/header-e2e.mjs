// Header E2E: the <head> theme script, the theme switcher and the user-menu skeleton.
// Run against `pnpm dev -p 3123` (the React "script tag" warning is dev-only) and against `pnpm start -p 3123`
// (skeleton timings). The signed-in part needs `member@test.local` with a photo (`avatar_url` = `<BASE_URL>/apple-icon.png`)
// and local email sign-in (docs/learnings/testing.md).
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123).
import { launch, newPage, signIn, throttle } from "./e2e-lib.mjs";
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

// Real scrollbars (Windows-style, 15px): a page whose skeleton is taller than its content toggles the scrollbar.
const browser = await launch({ scrollbars: true });

async function fresh({ theme = "light", signedIn = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  if (theme) await page.evaluateOnNewDocument((t) => localStorage.setItem("theme", t), theme);
  if (signedIn) await signIn(page, "member@test.local", BASE);
  return { ctx, page, errors };
}
const scriptTagErrors = (errors) => errors.filter((e) => e.includes("Encountered a script tag"));
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
/** Opens a header dropdown (trigger selector) and picks a radio item (by text, or the unchecked one). */
async function pick(page, triggerSel, itemText = "") {
  for (let i = 0; i < 5; i++) {
    const trigger = await visible(page, triggerSel);
    if (trigger) await trigger.click();
    await sleep(400);
    const item = await visible(
      page,
      itemText ? '[role="menuitemradio"]' : '[role="menuitemradio"]:not([aria-checked="true"])',
      itemText,
    );
    if (item) {
      await item.click();
      return;
    }
    await page.keyboard.press("Escape");
    await sleep(300);
  }
  throw new Error(`could not pick from ${triggerSel}`);
}
const switchLanguage = (page) => pick(page, '[data-skeleton-result="locale-switcher"]:not([disabled])');
// Theme scripts in <head> that the browser would execute (no type, or a JavaScript type).
const state = (page) =>
  page.evaluate(() => ({
    lang: document.documentElement.lang,
    dark: document.documentElement.classList.contains("dark"),
    executable: [...document.head.querySelectorAll("script:not([src])")]
      .filter((s) => s.textContent.includes("prefers-color-scheme"))
      .filter((s) => !s.type || /javascript/i.test(s.type)).length,
  }));
// Logs every frame where the user-menu box (skeleton or result) or the language button position changes.
function frameLogger() {
  window.__frames = [];
  let last = "";
  const tick = () => {
    const vis = (e) => e && e.getBoundingClientRect().width > 0;
    const um = [...document.querySelectorAll('[data-skeleton="user-menu"],[data-skeleton-result="user-menu"]')].find(
      vis,
    );
    const loc = [
      ...document.querySelectorAll('[data-skeleton-result="locale-switcher"],[data-skeleton="locale-switcher"]'),
    ].find(vis);
    const f = um && {
      kind: um.dataset.skeleton ? "skeleton" : "result",
      w: Math.round(um.getBoundingClientRect().width),
      h: Math.round(um.getBoundingClientRect().height),
      localeX: loc ? Math.round(loc.getBoundingClientRect().x) : null,
      photo: [...um.querySelectorAll("img")].some(
        (i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 0,
      ),
    };
    const k = JSON.stringify(f);
    if (f && k !== last) {
      window.__frames.push(f);
      last = k;
    }
    if (performance.now() < 20000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const fmt = (frames) => frames.map((f) => `${f.kind} ${f.w}x${f.h}@${f.localeX}${f.photo ? "+photo" : ""}`).join(" → ");

// 1. Language switch (client-side navigation that remounts the [locale] layout).
{
  const { page, errors } = await fresh();
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(500);
  const before = await state(page);
  check("light theme applied on load", before.lang === "tr" && !before.dark, JSON.stringify(before));
  await switchLanguage(page);
  await page.waitForFunction(() => document.documentElement.lang === "en", { timeout: 15000 });
  await sleep(1000);
  const after = await state(page);
  check("still light after the language switch", !after.dark, JSON.stringify(after));
  check("client-rendered theme script is not executable", after.executable === 1, `executable: ${after.executable}`);
  check(
    "no script-tag warning on language switch",
    scriptTagErrors(errors).length === 0,
    scriptTagErrors(errors)[0] ?? "",
  );
}

// 2. Direct load of an unknown path (the 404 is rendered on the client).
{
  const { page, errors } = await fresh();
  await page.goto(BASE + "/en/no-such-page-e2e", { waitUntil: "networkidle0" });
  await sleep(1000);
  const s = await state(page);
  check("404: light theme kept", !s.dark, JSON.stringify(s));
  check("404: no script-tag warning", scriptTagErrors(errors).length === 0, scriptTagErrors(errors)[0] ?? "");
}

// 3. Theme choice syncs to other open tabs.
{
  const { ctx, page } = await fresh({ theme: null });
  const other = await newPage(ctx);
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await other.goto(BASE + "/events", { waitUntil: "networkidle0" });
  await sleep(500);
  await page.bringToFront(); // background tabs don't take clicks
  await pick(page, 'button[aria-label="Tema"]', "Açık");
  await sleep(500);
  const s = await state(other);
  check("other tab follows the theme choice", !s.dark, JSON.stringify(s));
}

// 4. Switching the theme doesn't animate colours (elements with transitions snap with the page).
{
  const { page } = await fresh({ theme: null });
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(500);
  await page.evaluate(() => {
    const els = [...document.querySelectorAll("body *")].filter((e) => {
      const s = getComputedStyle(e);
      return parseFloat(s.transitionDuration) > 0 && /all|color|background|border/.test(s.transitionProperty);
    });
    const read = () =>
      els.map((e) => {
        const s = getComputedStyle(e);
        return `${s.color}|${s.backgroundColor}|${s.borderColor}`;
      });
    window.__transitionEls = els.length;
    new MutationObserver(() => {
      setTimeout(() => {
        window.__mid = read();
      }, 50);
      setTimeout(() => {
        window.__end = read();
      }, 800);
    }).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  });
  await pick(page, 'button[aria-label="Tema"]', "Açık");
  await sleep(1200);
  const r = await page.evaluate(() => ({ n: window.__transitionEls, mid: window.__mid, end: window.__end }));
  const differing = r.mid && r.end ? r.mid.filter((v, i) => v !== r.end[i]).length : -1;
  check(
    "theme switch: colours don't animate",
    r.n > 0 && differing === 0,
    `${r.n} elements with transitions, ${differing} still animating at +50ms`,
  );
}

// 5. User-menu skeleton has the shape of what replaces it (signed out: button; signed in: avatar circle).
for (const signedIn of [false, true]) {
  const who = signedIn ? "signed in" : "signed out";
  const { ctx } = await fresh({ signedIn });
  const page = await newPage(ctx);
  await throttle(page, { latency: 300, kbps: 2000 }); // makes the fallback visible long enough to be seen
  await page.evaluateOnNewDocument(frameLogger);
  await page.goto(BASE + "/en/events", { waitUntil: "networkidle0" });
  await sleep(500);
  const frames = await page.evaluate(() => window.__frames);
  const skel = frames.filter((f) => f.kind === "skeleton");
  // Compare at the swap: the web font can load later and resize the real button (and the skeleton) on its own.
  const swap = frames.findIndex((f, i) => f.kind === "result" && frames[i - 1]?.kind === "skeleton");
  check(`hard load (${who}): skeleton seen`, skel.length > 0, fmt(frames));
  check(
    `hard load (${who}): skeleton size = result size at the swap`,
    swap > 0 && frames[swap].w === frames[swap - 1].w && frames[swap].localeX === frames[swap - 1].localeX,
    fmt(frames),
  );
  if (signedIn) {
    // Switch to tr and back: the second switch reuses the cached shell and shows the fallback again.
    await page.evaluate(() => {
      window.__frames = [];
    });
    await switchLanguage(page);
    await page.waitForFunction(() => document.documentElement.lang === "tr", { timeout: 15000 });
    await sleep(2500);
    await switchLanguage(page);
    await page.waitForFunction(() => document.documentElement.lang === "en", { timeout: 15000 });
    await sleep(2500);
    const sw = await page.evaluate(() => window.__frames);
    const xs = sw.map((f) => f.localeX).filter((x) => x !== null);
    const swSkel = sw.filter((f) => f.kind === "skeleton");
    // The fallback only shows when the cached shell commits before the user menu (seen with `pnpm start`, not always in dev).
    if (swSkel.length === 0)
      console.log(`SKIP language switch back (signed in): fallback not shown in this run — ${fmt(sw)}`);
    else
      check(
        "language switch back (signed in): skeleton is the avatar circle",
        swSkel.every((f) => f.w === 32 && f.h === 32),
        fmt(sw),
      );
    // The photo this tab already showed stays visible while the menu streams in again (no grey placeholder).
    check("language switch back (signed in): photo stays visible", sw.length > 0 && sw.every((f) => f.photo), fmt(sw));
    // TR/EN labels differ by ~1px; a skeleton/result width mismatch moves the button by ~40px.
    check(
      "language switch back (signed in): language button doesn't jump",
      Math.max(...xs) - Math.min(...xs) <= 2,
      fmt(sw),
    );
  }
}

// 6. A member on /apply sees a short card, but the page skeleton is the long form: the scrollbar comes and goes
//    during a language switch. The header must not move sideways (desktop, real scrollbars).
{
  const { ctx } = await fresh({ signedIn: true });
  const page = await newPage(ctx, { width: 1280, height: 800 });
  await page.goto(BASE + "/apply", { waitUntil: "networkidle0" });
  await sleep(500);
  await throttle(page, { latency: 300, kbps: 2000 });
  await page.evaluate(() => {
    window.__xs = [];
    const t0 = performance.now();
    const tick = () => {
      const logo = [...document.querySelectorAll("header a")].find((a) => a.getBoundingClientRect().width > 0);
      const x = Math.round(logo.getBoundingClientRect().x);
      const sb = window.innerWidth - document.documentElement.clientWidth;
      if (!window.__xs.length || window.__xs.at(-1).x !== x || window.__xs.at(-1).sb !== sb)
        window.__xs.push({ x, sb });
      if (performance.now() - t0 < 15000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await switchLanguage(page);
  await page.waitForFunction(() => document.documentElement.lang === "en", { timeout: 15000 });
  await sleep(2500);
  await switchLanguage(page); // back: the cached shell shows the skeleton again
  await page.waitForFunction(() => document.documentElement.lang === "tr", { timeout: 15000 });
  await sleep(2500);
  const xs = await page.evaluate(() => window.__xs);
  const seq = xs.map((f) => `x${f.x}/sb${f.sb}`).join(" → ");
  check(
    "apply (member, desktop): scrollbar toggled during the switch (test is meaningful)",
    new Set(xs.map((f) => f.sb)).size > 1 || xs.some((f) => f.sb > 0),
    seq,
  );
  check("apply (member, desktop): header doesn't move sideways", new Set(xs.map((f) => f.x)).size === 1, seq);
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
