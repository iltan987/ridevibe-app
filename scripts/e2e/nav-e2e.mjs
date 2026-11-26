// Navigation progress E2E. Needs a production server on :3123 (pnpm build && pnpm start -p 3123), admin@test.local and seeded applications.
// Env: PUPPETEER_DIR (required), OUT_DIR (screenshots, default: OS temp dir).
import { launch, newPage, signIn, throttle } from "./e2e-lib.mjs";
import os from "node:os";
import path from "node:path";
const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const browser = await launch();

async function fresh({ slow = true, delayRsc = 2500, noPrefetch = true, theme, reduced = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  await signIn(page, "admin@test.local");
  if (theme) await page.evaluateOnNewDocument((t) => localStorage.setItem("theme", t), theme);
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  page._slow = { slow, delayRsc, noPrefetch };
  return { ctx, page };
}
/** Go to path, let it settle, then apply throttle + RSC delay. noPrefetch aborts router prefetches, so a tap
 *  has to fetch for real (what happens when the prefetch has not landed yet / the route is dynamic). */
async function open(page, p) {
  const { slow, delayRsc, noPrefetch } = page._slow;
  let delaying = false;
  if (delayRsc || noPrefetch) {
    await page.setRequestInterception(true);
    page.on("request", (rq) => {
      const h = rq.headers();
      if (noPrefetch && h["next-router-prefetch"]) return rq.abort().catch(() => {});
      if (delaying && delayRsc && h["rsc"]) setTimeout(() => rq.continue().catch(() => {}), delayRsc);
      else rq.continue().catch(() => {});
    });
  }
  await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(noPrefetch ? 500 : 3000);
  if (slow) await throttle(page, { latency: 400, kbps: 400 });
  delaying = true;
}
const state = (page) =>
  page.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().width > 0;
    const bar = [...document.querySelectorAll("[data-nav-progress]")].find(vis);
    const pend = [...document.querySelectorAll("a")].filter(
      (a) => vis(a) && a.querySelector(":scope > [data-link-pending]"),
    );
    const skel = [...document.querySelectorAll(".animate-pulse")].some(vis);
    return {
      bar: !!bar,
      skel,
      pending: pend.map((a) => a.getAttribute("href")),
      opac: pend.map((a) => getComputedStyle(a).opacity),
    };
  });
async function visibleLink(page, hrefPart, text = "", scope = "") {
  const h = await page.evaluateHandle(
    (hrefPart, text, scope) => {
      const root = scope ? document.querySelector(scope) : document;
      return (
        [...root.querySelectorAll("a")].find(
          (a) =>
            a.getBoundingClientRect().width > 0 &&
            (a.getAttribute("href") ?? "").includes(hrefPart) &&
            (!text || a.textContent.includes(text)),
        ) ?? null
      );
    },
    hrefPart,
    text,
    scope,
  );
  return h.asElement();
}
async function waitFor(page, pred, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await state(page);
    if (pred(s)) return { ok: true, at: Date.now() - t0, s };
    await sleep(25);
  }
  return { ok: false, at: ms, s: await state(page) };
}
/** Slow navigation scenario: tap, expect bar <=600ms + pending marker on tapped link, then both gone after URL change. */
async function slowNav(name, startPath, getEl, urlPart, { skeleton = false } = {}) {
  const { ctx, page } = await fresh({ noPrefetch: !skeleton });
  await open(page, startPath);
  const el = await getEl(page);
  if (!el) {
    check(`${name}: tap target found`, false);
    await ctx.close();
    return;
  }
  const before = page.url();
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
  if (skeleton) {
    // The route commits to its loading.tsx skeleton at once; the old page (and its link) is hidden, so the
    // skeleton is the feedback and the bar/dim legitimately stand down (see docs/learnings/nextjs.md).
    const r = await waitFor(page, (s) => s.skel, 600);
    check(`${name}: loading skeleton visible within 600ms`, r.ok, `${r.at}ms`);
  } else {
    const r = await waitFor(page, (s) => s.bar, 600);
    check(`${name}: bar visible within 600ms`, r.ok, `${r.at}ms`);
    const s1 = await state(page);
    check(
      `${name}: tapped link has pending marker (dimmed)`,
      s1.pending.length > 0 && s1.opac.every((o) => parseFloat(o) < 1),
      JSON.stringify(s1.pending) + " " + s1.opac,
    );
  }
  const done = await waitFor(page, (s) => !s.bar && !s.skel && s.pending.length === 0 && page.url() !== before, 15000);
  check(
    `${name}: URL changed, bar and marker gone after render`,
    done.ok && (!urlPart || page.url().includes(urlPart)),
    `${done.at}ms ${page.url().replace(BASE, "")}`,
  );
  await ctx.close();
}

// 1-4 bottom tab, chip, pager, card
await slowNav("bottom tab", "/admin/applications", (p) => visibleLink(p, "/events", "", "nav.fixed"), "/events");
await slowNav("filter chip", "/admin/applications", (p) => visibleLink(p, "status=approved"), "status=approved");
await slowNav("pager page 2", "/admin/applications", (p) => visibleLink(p, "page=2"), "page=2");
await slowNav(
  "list card -> detail",
  "/admin/applications",
  async (p) => {
    const h = await p.evaluateHandle(
      () =>
        [...document.querySelectorAll("a")].find(
          (a) =>
            a.getBoundingClientRect().width > 0 &&
            /\/admin\/applications\/[0-9a-f-]{36}/.test(a.getAttribute("href") ?? ""),
        ) ?? null,
    );
    return h.asElement();
  },
  "/admin/applications/",
);
await slowNav(
  "list card -> detail (prefetched)",
  "/admin/applications",
  async (p) => {
    const h = await p.evaluateHandle(
      () =>
        [...document.querySelectorAll("a")].find(
          (a) =>
            a.getBoundingClientRect().width > 0 &&
            /\/admin\/applications\/[0-9a-f-]{36}/.test(a.getAttribute("href") ?? ""),
        ) ?? null,
    );
    return h.asElement();
  },
  "/admin/applications/",
  { skeleton: true },
);

// 5 dropdown
{
  const { ctx, page } = await fresh();
  await open(page, "/events");
  await (await page.$('button[aria-label="Hesap menüsü"]')).click();
  await sleep(800);
  const el = await visibleLink(page, "/admin/applications", "", "[role=menu]");
  check("user dropdown: menu item found", !!el);
  await el.click();
  const r = await waitFor(page, (s) => s.bar, 800);
  check("user dropdown -> Başvurular: bar visible", r.ok, `${r.at}ms`);
  const done = await waitFor(
    page,
    (s) => !s.bar && s.pending.length === 0 && page.url().includes("/admin/applications"),
    15000,
  );
  check("user dropdown: bar cleared after render", done.ok, page.url().replace(BASE, ""));
  await ctx.close();
}

// 6 double tap
{
  const { ctx, page } = await fresh();
  await open(page, "/admin/applications");
  const a = await visibleLink(page, "/events", "", "nav.fixed"),
    b = await visibleLink(page, "/gallery", "", "nav.fixed");
  await a.click();
  await sleep(60);
  await b.click();
  const r = await waitFor(page, (s) => s.bar, 800);
  check("double tap: bar visible", r.ok);
  const done = await waitFor(page, (s) => !s.bar && s.pending.length === 0 && page.url().endsWith("/gallery"), 20000);
  check("double tap: bar and markers cleared after B renders", done.ok, page.url().replace(BASE, ""));
  await sleep(1500);
  const s = await state(page);
  check("double tap: still clear 1.5s later", !s.bar && s.pending.length === 0, JSON.stringify(s));
  await ctx.close();
}

// 7 active tab
{
  const { ctx, page } = await fresh({ delayRsc: 0, noPrefetch: false });
  await open(page, "/events");
  const a = await visibleLink(page, "/events", "", "nav.fixed");
  await a.click();
  let seen = false;
  const t0 = Date.now();
  const tl = [];
  while (Date.now() - t0 < 1000) {
    const x = await state(page);
    if (x.bar) {
      seen = true;
      tl.push(Date.now() - t0);
    }
    await sleep(50);
  }
  await sleep(100);
  const s = await state(page);
  console.log(
    `INFO active tab re-tap: bar was shown ${seen ? tl[0] + ".." + tl.at(-1) + "ms" : "never"} (Next refetches the same URL; 400ms latency)`,
  );
  check(
    "active tab re-tap: no bar / marker left after 1s",
    !s.bar && s.pending.length === 0,
    `seenDuring=${seen} at=${tl[0]}..${tl.at(-1)}ms pending=${JSON.stringify(s.pending)}`,
  );
  await ctx.close();
}

// 8 fast network, prefetched tab
{
  const { ctx, page } = await fresh({ slow: false, delayRsc: 0, noPrefetch: false });
  await open(page, "/admin/applications");
  const a = await visibleLink(page, "/events", "", "nav.fixed");
  await a.click();
  let seen = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 2000) {
    if ((await state(page)).bar) seen = true;
    await sleep(50);
  }
  check(
    "fast network, prefetched tab: bar never appears",
    !seen && page.url().endsWith("/events"),
    page.url().replace(BASE, ""),
  );
  await ctx.close();
}

// 9 reduced motion
{
  const { ctx, page } = await fresh({ reduced: true });
  await open(page, "/admin/applications");
  await (await visibleLink(page, "/events", "", "nav.fixed")).click();
  const r = await waitFor(page, (s) => s.bar, 800);
  check("reduced motion: bar visible", r.ok);
  const info = await page.evaluate(() => {
    const inner = document.querySelector("[data-nav-progress] > div");
    // Full width = the body's width: `scrollbar-gutter: stable` reserves 15px even in headless Chrome, so `innerWidth`
    // is wider than the page on long pages (docs/learnings/testing.md).
    return {
      name: getComputedStyle(inner).animationName,
      anims: inner.getAnimations().length,
      w: inner.getBoundingClientRect().width,
      body: document.body.clientWidth,
    };
  });
  check(
    "reduced motion: no running animation, full width",
    info.name === "none" && info.anims === 0 && Math.abs(info.w - info.body) < 1,
    JSON.stringify(info),
  );
  await ctx.close();
}

// 10 screenshots
for (const theme of ["dark", "light"]) {
  const { ctx, page } = await fresh({ theme });
  await open(page, "/admin/applications");
  await (await visibleLink(page, "/events", "", "nav.fixed")).click();
  const r = await waitFor(page, (s) => s.bar, 800);
  await sleep(1500);
  const file = path.join(DIR, `nav-bar-${theme}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 390, height: 120 } });
  const cls = await page.evaluate(() => document.documentElement.className);
  check(
    `screenshot ${theme}: bar shown, theme applied`,
    r.ok && cls.split(" ").includes("dark") === (theme === "dark"),
    file,
  );
  await ctx.close();
}

// 11 locale switcher (record only)
{
  const { ctx, page } = await fresh();
  await open(page, "/events");
  await (await page.$('button[aria-label="Dil: TR"]')).click();
  await sleep(500);
  const item = await page.evaluateHandle(
    () =>
      [...document.querySelectorAll("[role=menuitemradio]")].find(
        (e) => e.getBoundingClientRect().width > 0 && /English|EN/.test(e.textContent),
      ) ?? null,
  );
  await item.asElement().click();
  let sawBar = false,
    sawDim = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000 && !page.url().includes("/en")) {
    const s = await state(page);
    sawBar ||= s.bar;
    sawDim ||= s.pending.length > 0;
    await sleep(50);
  }
  const switched = page.url().includes("/en");
  await sleep(1500);
  const s = await state(page);
  const btnDisabled = await page.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Dil'], button[aria-label^='Language']")].some((b) => b.disabled),
  );
  console.log(
    `INFO locale switch: bar appeared=${sawBar}, dim appeared=${sawDim}, url=${page.url().replace(BASE, "")}`,
  );
  check("locale switch: switched to /en", switched);
  check(
    "locale switch: nothing sticks (no bar, no marker, button enabled)",
    !s.bar && s.pending.length === 0 && !btnDisabled,
    JSON.stringify(s),
  );
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
