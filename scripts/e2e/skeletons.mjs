// Measures Suspense fallbacks against the content that replaces them.
// Usage: node skeletons.mjs <baseUrl> <out.md> [routes…]      (default routes: / /sign-in /apply /account)
// Env:   STATES=signed-out,member,admin (default; also available: pending-noapp,pending-app, which need those users)
//        VIEWPORTS=390,1280        THEMES=dark,light
//        SWITCH_BACK=1: also switch the language twice (JS on, throttled) and log the fallbacks shown during the
//        switch back (a language switch remounts the [locale] layout and re-shows them; CLAUDE.md "Loading states")
// How: fallback roots carry data-skeleton="<name>", result roots data-skeleton-result="<name>".
//  - JS off (setJavaScriptEnabled(false)): the streamed content stays in hidden templates, the fallback stays visible
//    -> box of the first visible [data-skeleton=name].
//  - JS on, network idle: box of the first visible [data-skeleton-result=name] (Next keeps old routes hidden in the DOM).
// Theme: the inline head script reads localStorage "theme"; JS on -> set before load; JS off -> the script can't run,
//   so the `dark` class on <html> is toggled afterwards via a CDP evaluate (the stylesheet is the same).
// Any [data-skeleton] / [data-skeleton-result] on the page is picked up, so new fallbacks need no script change.
import { writeFileSync } from "node:fs";
import { launch, newPage, signIn, throttle } from "./e2e-lib.mjs";

const [baseUrl, out, ...routeArgs] = process.argv.slice(2);
if (!baseUrl || !out) {
  console.error("usage: node skeletons.mjs <baseUrl> <out.md> [routes…]");
  process.exit(1);
}
const routes = routeArgs.length ? routeArgs : ["/", "/sign-in", "/apply", "/account"];
const ALL_STATES = {
  "signed-out": null,
  "pending-noapp": "pending-noapp@test.local",
  "pending-app": "pending-app@test.local",
  member: "member@test.local",
  admin: "admin@test.local",
};
const states = (process.env.STATES ?? "signed-out,member,admin").split(",");
const widths = (process.env.VIEWPORTS ?? "390,1280").split(",").map(Number);
const themes = (process.env.THEMES ?? "dark,light").split(",");
const heights = { 390: 844, 1280: 800 };
const switchBack = process.env.SWITCH_BACK === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MEASURE = (attr) => {
  const out = {};
  for (const el of document.querySelectorAll(`[${attr}]`)) {
    const name = el.getAttribute(attr);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && !(name in out)) out[name] = { h: r.height, w: r.width };
  }
  return out;
};

const browser = await launch();
const rows = [];
const trickChecks = [];
const switchRows = [];

/** Opens the language menu and picks the other language; resolves once the URL changed and the page is idle. */
async function switchLanguage(page) {
  const before = page.url();
  for (let i = 0; i < 5 && page.url() === before; i++) {
    await page.evaluate(() => [...document.querySelectorAll('[data-skeleton-result="locale-switcher"]:not([disabled])')].find((e) => e.getBoundingClientRect().width > 0)?.click());
    await sleep(400);
    await page.evaluate(() => [...document.querySelectorAll('[role="menuitemradio"]:not([aria-checked="true"])')].find((e) => e.getBoundingClientRect().width > 0)?.click());
    for (let t = 0; t < 100 && page.url() === before; t++) await sleep(100);
  }
  await page.waitForNetworkIdle({ idleTime: 500 }).catch(() => {});
}

/** Fallback boxes seen during a switch back (largest height per name), JS on and throttled so they last. */
async function measureSwitchBack(page, route, theme) {
  await page.evaluateOnNewDocument((th) => {
    try {
      localStorage.setItem("theme", th);
    } catch {}
  }, theme);
  await page.goto(new URL(route, baseUrl).href, { waitUntil: "networkidle0", timeout: 60000 });
  await sleep(400);
  await switchLanguage(page);
  await sleep(800);
  await page.evaluate(() => {
    window.__fallbacks = {};
    const tick = () => {
      for (const el of document.querySelectorAll("[data-skeleton]")) {
        const r = el.getBoundingClientRect();
        const name = el.getAttribute("data-skeleton");
        if (r.width > 0 && r.height > 0 && !(name in window.__fallbacks)) window.__fallbacks[name] = { h: r.height, w: r.width };
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cdp = await throttle(page, { latency: 400, kbps: 2000 });
  await switchLanguage(page);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await sleep(800);
  return page.evaluate(() => window.__fallbacks);
}

async function measure(page, route, js, theme) {
  const url = new URL(route, baseUrl).href;
  await page.setJavaScriptEnabled(js);
  if (js) {
    await page.evaluateOnNewDocument((th) => {
      try {
        localStorage.setItem("theme", th);
      } catch {}
    }, theme);
  }
  await page.goto(url, { waitUntil: js ? "networkidle0" : "load", timeout: 60000 });
  if (!js) {
    await page.evaluate((th) => document.documentElement.classList.toggle("dark", th === "dark"), theme);
  } else {
    await new Promise((r) => setTimeout(r, 400));
  }
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(MEASURE, js ? "data-skeleton-result" : "data-skeleton");
}

for (const state of states) {
  for (const width of widths) {
    for (const theme of themes) {
      for (const route of routes) {
        const ctx = await browser.createBrowserContext();
        const viewport = { width, height: heights[width] ?? 800 };
        const open = async () => {
          const page = await newPage(ctx, viewport);
          if (ALL_STATES[state]) await signIn(page, ALL_STATES[state], baseUrl);
          return page;
        };
        const p1 = await open();
        const sk = await measure(p1, route, false, theme);
        await p1.close();
        const p2 = await open();
        const re = await measure(p2, route, true, theme);
        await p2.close();
        if (switchBack) {
          const p3 = await open();
          const seen = await measureSwitchBack(p3, route, theme);
          await p3.close();
          for (const name of Object.keys(sk)) switchRows.push({ name, route, state, width, theme, re: re[name], seen: seen[name] });
        }
        await ctx.close();
        const names = new Set([...Object.keys(sk), ...Object.keys(re)]);
        for (const name of names) rows.push({ name, route, state, width, theme, sk: sk[name], re: re[name] });
        trickChecks.push({ route, state, n: Object.keys(sk).length });
        console.error(`${state} ${width} ${theme} ${route}: ${[...names].join(",")}`);
      }
    }
  }
}
await browser.close();

const f = (m) => (m ? `${Math.round(m.h * 10) / 10}×${Math.round(m.w * 10) / 10}` : "—");
const d = (r) => (r.sk && r.re ? Math.round((r.sk.h - r.re.h) * 10) / 10 : null);

let md = `# Skeleton measurements\n\nBase URL: ${baseUrl}. Cells are height×width in CSS px; Δh = skeleton − result (— = element not present in that state/mode).\n\n`;

// Summary: worst |Δh| per name × state, over routes/viewports/themes.
const sum = new Map();
for (const r of rows) {
  const dv = d(r);
  if (dv === null) continue;
  const k = `${r.name} | ${r.state}`;
  const cur = sum.get(k) ?? { worst: 0, at: "" };
  if (Math.abs(dv) >= Math.abs(cur.worst)) sum.set(k, { worst: dv, at: `${r.route} ${r.width} ${r.theme}` });
  else if (!sum.has(k)) sum.set(k, cur);
}
md += `## Summary: worst Δh per fallback and state (all routes, viewports, themes)\n\n| fallback | state | worst Δh | where |\n|---|---|---|---|\n`;
for (const [k, v] of [...sum].sort()) md += `| ${k} | ${v.worst} | ${v.at} |\n`;

md += `\n## All rows\n\n| name | route | state | viewport | theme | skeleton h×w | result h×w | Δh |\n|---|---|---|---|---|---|---|---|\n`;
rows.sort((a, b) => (a.name + a.route + a.state).localeCompare(b.name + b.route + b.state) || a.width - b.width || a.theme.localeCompare(b.theme));
for (const r of rows) md += `| ${r.name} | ${r.route} | ${r.state} | ${r.width} | ${r.theme} | ${f(r.sk)} | ${f(r.re)} | ${d(r) ?? "—"} |\n`;
if (switchBack) {
  md += `\n## Switch back (JS on, throttled): fallback seen during the second language switch vs. the result\n\n| name | route | state | viewport | theme | seen on switch back h×w | result h×w | Δh |\n|---|---|---|---|---|---|---|---|\n`;
  for (const r of switchRows) md += `| ${r.name} | ${r.route} | ${r.state} | ${r.width} | ${r.theme} | ${f(r.seen)} | ${f(r.re)} | ${r.seen ? (r.re ? Math.round((r.seen.h - r.re.h) * 10) / 10 : "—") : "not seen"} |\n`;
}
writeFileSync(out, md);
console.error(`wrote ${out}`);
