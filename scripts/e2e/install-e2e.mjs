// "Install the app" prompt E2E (banner on /account and /members, avatar-menu entry, guide dialog).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123), local email sign-in and the fixture users
// member@test.local (active), pending-noapp@test.local (pending) and inactive@test.local (inactive); see
// scripts/e2e/README.md. Chrome needs --bypass-app-banner-engagement-checks (set below) to fire the real
// `beforeinstallprompt`; the event is real, only prompt()/userChoice are stubbed on the instance (see the init script).
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123).
import { launch, newPage, signIn } from "./e2e-lib.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const FIREFOX_ANDROID_UA = "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
const TR = { banner: "Uygulamayı yükle", menu: "Hesap menüsü", entry: "Uygulamayı yükle", install: "Yükle", howTo: "Nasıl?", notNow: "Şimdi değil", close: "Kapat" };
const EN = { banner: "Install the app", install: "Install" };

const browser = await launch({ args: ["--bypass-app-banner-engagement-checks"] });
const hydrationIssues = [];

// Runs before any page script (evaluateOnNewDocument), so its capture-phase listener sees the REAL event first.
//   suppress   swallow the event (iPhone / Android Firefox cases)
//   hold       keep the first real event back; `window.__release()` fires a synthetic one later
//   outcome    what the stubbed userChoice resolves to
//   noBipe     delete window.BeforeInstallPromptEvent (Firefox has none)
//   standalone make matchMedia("(display-mode: standalone)") match (CDP can't emulate display-mode in Chrome 157)
//   installed  pre-set the stored "installed" flag
function initScript(cfg) {
  window.__promptCalls = 0;
  window.__held = null;
  if (cfg.noBipe) delete window.BeforeInstallPromptEvent;
  if (cfg.installed) { try { localStorage.setItem("rv-install-installed", "1"); } catch {} }
  if (cfg.standalone) {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => /display-mode:\s*standalone/.test(q)
      ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }
      : real(q);
  }
  // Chrome ignores a re-dispatched real event, so a held one is released as a synthetic stand-in (layout test only).
  window.__release = () => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.__stubbed = true;
    e.prompt = () => { window.__promptCalls++; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: cfg.outcome ?? "dismissed" });
    window.dispatchEvent(e);
  };
  window.addEventListener("beforeinstallprompt", (e) => {
    if (e.__stubbed) return;
    if (cfg.suppress) { e.stopImmediatePropagation(); return; }
    if (cfg.hold && !window.__held) { window.__held = e; e.stopImmediatePropagation(); return; }
    e.prompt = () => { window.__promptCalls++; return Promise.resolve(); };
    Object.defineProperty(e, "userChoice", { value: Promise.resolve({ outcome: cfg.outcome ?? "dismissed" }) });
  }, true);
}

// Chrome fires `beforeinstallprompt` only in the DEFAULT browser context (never in incognito-style contexts from
// createBrowserContext), so tests share it and `ctx.close()` wipes cookies and site data between scenarios.
function freshContext() {
  const pages = [];
  return {
    async newPage() { const p = await browser.newPage(); p.setDefaultTimeout(15000); pages.push(p); return p; },
    async close() {
      const cdp = await pages[0].createCDPSession();
      await cdp.send("Network.clearBrowserCookies");
      await cdp.send("Storage.clearDataForOrigin", { origin: new URL(BASE).origin, storageTypes: "all" });
      await Promise.all(pages.map((p) => p.close()));
    },
  };
}
async function fresh({ email, cfg = {}, ua, viewport } = {}) {
  const ctx = freshContext();
  return { ctx, page: await newTab(ctx, { email, cfg, ua, viewport }) };
}
async function newTab(ctx, { email, cfg = {}, ua, viewport } = {}) {
  const page = await newPage(ctx, viewport);
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type()) && /hydrat|did not match|Minified React error #(418|423|425|419)/i.test(m.text())) hydrationIssues.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => { if (/hydrat|#418|#423|#425|#419/i.test(e.message)) hydrationIssues.push(e.message.slice(0, 200)); });
  if (ua) await page.setUserAgent(ua);
  await page.evaluateOnNewDocument(initScript, cfg);
  if (email) await signIn(page, email, BASE);
  return page;
}

async function until(fn, ms = 8000, step = 100) {
  const end = Date.now() + ms;
  while (Date.now() < end) { try { if (await fn()) return true; } catch { /* navigation in flight */ } await sleep(step); }
  return false;
}
// Next keeps the previous route's tree in the DOM, hidden: always pick the visible element.
async function visible(page, sel, text = "") {
  const h = await page.evaluateHandle((sel, text) => [...document.querySelectorAll(sel)]
    .find((e) => e.getBoundingClientRect().width > 0 && (!text || e.textContent.trim() === text)) ?? null, sel, text);
  return h.asElement();
}
const hasBanner = (page, label = TR.banner) => page.evaluate((label) =>
  [...document.querySelectorAll('[role="region"]')].some((e) => e.getAttribute("aria-label") === label && e.getBoundingClientRect().width > 0), label);
const bannerButton = (page, text, label = TR.banner) => page.evaluateHandle((label, text) => {
  const region = [...document.querySelectorAll('[role="region"]')].find((e) => e.getAttribute("aria-label") === label && e.getBoundingClientRect().width > 0);
  return [...(region?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === text) ?? null;
}, label, text).then((h) => h.asElement());
const heldPrompt = (page) => page.evaluate(() => Boolean(window.__rvInstallPrompt));
const promptCalls = (page) => page.evaluate(() => window.__promptCalls);
const dialogOpen = (page) => page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((e) => e.getBoundingClientRect().width > 0));
const dialogItems = (page) => page.evaluate(() => [...document.querySelectorAll('[role="dialog"] li')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim()));

/** Opens `path`, waits until the real install event reached the store (when `expectEvent`), then a beat to settle. */
async function open(page, path, { expectEvent = true } = {}) {
  await page.goto(BASE + path, { waitUntil: "load" });
  if (expectEvent) {
    const ok = await until(async () => (await heldPrompt(page)) || (await page.evaluate(() => Boolean(window.__held))), 15000);
    if (!ok) { await page.mouse.click(195, 400); await until(() => heldPrompt(page), 10000); }
  }
  await sleep(600);
}
async function openMenu(page) {
  const trigger = await visible(page, `button[aria-label="${TR.menu}"]`);
  if (!trigger) return null;
  await trigger.click();
  await sleep(500);
  return trigger;
}
const menuEntry = (page, text = TR.entry) => page.evaluate((text) =>
  [...document.querySelectorAll('[role="menuitem"]')].some((e) => e.getBoundingClientRect().width > 0 && e.textContent.trim() === text), text);

// 1. Real event + stubbed prompt: "Yükle" calls prompt() once; "dismissed" hides the banner for good; the menu keeps it.
for (const path of ["/members", "/account"]) {
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { outcome: "dismissed" } });
  await open(page, path);
  check(`${path}: banner with "Yükle" shown from the real beforeinstallprompt`, (await hasBanner(page)) && Boolean(await bannerButton(page, TR.install)));
  await (await bannerButton(page, TR.install))?.click();
  check(`${path}: "Yükle" calls prompt() exactly once`, await until(async () => (await promptCalls(page)) === 1, 3000) && (await promptCalls(page)) === 1, `calls=${await promptCalls(page)}`);
  check(`${path}: outcome dismissed hides the banner`, await until(async () => !(await hasBanner(page)), 3000));
  await open(page, path);
  check(`${path}: still gone after reload (event fired again: ${await heldPrompt(page)})`, (await heldPrompt(page)) && !(await hasBanner(page)));
  await openMenu(page);
  check(`${path}: avatar-menu entry "Uygulamayı yükle" still there after the dismissal`, await menuEntry(page));
  await ctx.close();
}

// 2. Second tab: dismissal in tab A hides the banner in tab B without a reload.
{
  const { ctx, page: a } = await fresh({ email: "member@test.local", cfg: { outcome: "dismissed" } });
  await open(a, "/account");
  const b = await newTab(ctx, { cfg: { outcome: "dismissed" } });
  await open(b, "/members");
  check("two tabs: banner shown in both", (await hasBanner(a)) && (await hasBanner(b)));
  await a.bringToFront();
  await (await bannerButton(a, TR.notNow))?.click();
  check("two tabs: dismissed in tab A, banner gone in tab B without reload", await until(async () => !(await hasBanner(b)), 5000));
  check("two tabs: banner gone in tab A", !(await hasBanner(a)));
  await ctx.close();
}

// 3. iPhone Safari: "Nasıl?" opens the guide with the 3 Safari steps; Escape closes it.
{
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { suppress: true }, ua: IPHONE_UA });
  await open(page, "/account", { expectEvent: false });
  await until(() => hasBanner(page), 5000);
  check('iPhone: banner shows "Nasıl?" (no "Yükle")', Boolean(await bannerButton(page, TR.howTo)) && !(await bannerButton(page, TR.install)));
  await (await bannerButton(page, TR.howTo))?.click();
  await until(() => dialogOpen(page), 3000);
  const items = await dialogItems(page);
  check("iPhone: guide opens with the 3 Safari steps", items.length === 3 && /Safari'de Paylaş/.test(items[0]) && /Ana Ekrana Ekle/.test(items[1]), JSON.stringify(items));
  await page.keyboard.press("Escape");
  check("iPhone: Escape closes the guide", await until(async () => !(await dialogOpen(page)), 3000));
  await ctx.close();
}

// 4. Avatar menu -> "Uygulamayı yükle" (iPhone UA): dialog on top, focus inside, Kapat / Escape close it, focus not lost.
for (const how of ["close button", "Escape"]) {
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { suppress: true }, ua: IPHONE_UA });
  await open(page, "/members", { expectEvent: false });
  await until(() => hasBanner(page), 5000);
  await openMenu(page);
  check(`menu (${how}): entry "Uygulamayı yükle" present on iPhone`, await menuEntry(page));
  await (await visible(page, '[role="menuitem"]', TR.entry))?.click();
  const opened = await until(() => dialogOpen(page), 3000);
  await sleep(400);
  const info = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].find((e) => e.getBoundingClientRect().width > 0);
    if (!d) return null;
    const r = d.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { onTop: d.contains(top), focusInside: d.contains(document.activeElement) };
  });
  check(`menu (${how}): guide dialog visible above the page`, opened && info?.onTop === true, JSON.stringify(info));
  check(`menu (${how}): focus moved into the dialog`, info?.focusInside === true);
  if (how === "close button") await (await visible(page, '[role="dialog"] button', TR.close))?.click();
  else await page.keyboard.press("Escape");
  check(`menu (${how}): dialog closes`, await until(async () => !(await dialogOpen(page)), 3000));
  await sleep(400);
  const focus = await page.evaluate(() => {
    const a = document.activeElement;
    const t = [...document.querySelectorAll('button[aria-label="Hesap menüsü"]')].find((e) => e.getBoundingClientRect().width > 0);
    return { connected: a?.isConnected, visible: !!a && (a === document.body || a.getBoundingClientRect().width > 0), isBodyOrTrigger: a === document.body || a === t || t?.contains(a), tag: a?.tagName };
  });
  check(`menu (${how}): focus returns to the avatar trigger or body, not a removed node`, focus.connected && focus.visible && focus.isBodyOrTrigger, JSON.stringify(focus));
  await ctx.close();
}

// 5. Android Firefox: no BeforeInstallPromptEvent -> manual guide reachable right away.
{
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { suppress: true, noBipe: true }, ua: FIREFOX_ANDROID_UA });
  await open(page, "/account", { expectEvent: false });
  const shown = await until(() => hasBanner(page), 3000);
  check("Android Firefox: banner with the manual guide right away", shown && Boolean(await bannerButton(page, TR.howTo)));
  await (await bannerButton(page, TR.howTo))?.click();
  await until(() => dialogOpen(page), 3000);
  const items = await dialogItems(page);
  check("Android Firefox: android-manual steps", items.length === 3 && /Tarayıcı menüsünü aç/.test(items[0]), JSON.stringify(items));
  await ctx.close();
}

// 6. Installed: standalone (matchMedia stub) and the stored flag -> no banner, no menu entry, though the event fires.
for (const [name, cfg] of [["standalone (matchMedia stub)", { standalone: true }], ['rv-install-installed = "1"', { installed: true }]]) {
  const { ctx, page } = await fresh({ email: "member@test.local", cfg });
  await open(page, "/account");
  check(`${name}: real event reached the page (test is meaningful)`, await heldPrompt(page));
  check(`${name}: no banner`, !(await hasBanner(page)));
  await openMenu(page);
  check(`${name}: no menu entry`, !(await menuEntry(page)));
  await ctx.close();
}

// 7. Audiences: pending sees the banner on /account only; inactive and signed-out nothing.
{
  const { ctx, page } = await fresh({ email: "pending-noapp@test.local" });
  await open(page, "/account");
  check("pending: banner on /account", await hasBanner(page));
  await openMenu(page);
  check("pending: menu entry present", await menuEntry(page));
  await open(page, "/members");
  check("pending: no banner on /members", !(await hasBanner(page)), new URL(page.url()).pathname);
  await ctx.close();
}
{
  const { ctx, page } = await fresh({ email: "inactive@test.local" });
  for (const path of ["/account", "/members"]) {
    await open(page, path);
    check(`inactive: event reached the page on ${path}`, await heldPrompt(page));
    check(`inactive: no banner on ${path}`, !(await hasBanner(page)));
  }
  await openMenu(page);
  check("inactive: no menu entry", !(await menuEntry(page)));
  await ctx.close();
}
{
  const { ctx, page } = await fresh({});
  for (const path of ["/", "/account", "/members"]) {
    await open(page, path);
    check(`signed out: no banner on ${path}`, !(await hasBanner(page)), new URL(page.url()).pathname);
  }
  check("signed out: no avatar menu, so no install entry", !(await visible(page, `button[aria-label="${TR.menu}"]`)));
  await ctx.close();
}

// 8. Layout at 390px (Review Focus): scrolled to the bottom the last content ends above the banner; the banner sits
//    above the tab bar; nothing above moves when the banner appears.
for (const path of ["/account", "/members"]) {
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { hold: true } });
  await page.goto(BASE + path, { waitUntil: "load" });
  await until(() => page.evaluate(() => Boolean(window.__held)), 15000);
  await sleep(800);
  const hiddenBefore = !(await hasBanner(page));
  const before = await page.evaluate(() => {
    window.__els = [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().height > 0);
    window.__tops = window.__els.map((e) => Math.round(e.getBoundingClientRect().top * 10) / 10);
    return window.__els.length;
  });
  await page.evaluate(() => window.__release());
  const appeared = await until(() => hasBanner(page), 5000);
  await sleep(900); // slide-in animation
  const moved = await page.evaluate(() => {
    let shifted = 0, kept = 0;
    window.__els.forEach((e, i) => {
      if (!e.isConnected) return;
      kept++;
      if (Math.abs(e.getBoundingClientRect().top - window.__tops[i]) > 0.5) shifted++;
    });
    return { shifted, kept };
  });
  check(`${path}: banner appears after load (was hidden before: ${hiddenBefore})`, appeared && hiddenBefore);
  check(`${path}: content above doesn't move when the banner appears`, before > 5 && moved.kept >= before * 0.8 && moved.shifted === 0, `elements=${before} kept=${moved.kept} shifted=${moved.shifted}`);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await sleep(500);
  const m = await page.evaluate((label) => {
    const vis = (e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0;
    const banner = [...document.querySelectorAll('[role="region"]')].find((e) => e.getAttribute("aria-label") === label && vis(e));
    if (!banner) return null;
    const spacer = [...document.querySelectorAll("div[inert]")].find((e) => e.classList.contains("invisible") && vis(e));
    const tabBar = [...document.querySelectorAll("nav.fixed")].find(vis);
    const fixed = (e) => { for (let n = e; n && n !== document.body; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return true; return false; };
    let bottom = 0, last = null;
    for (const e of document.querySelectorAll("body *")) {
      if (!vis(e) || fixed(e) || e.contains(spacer) || spacer.contains(e) || banner.contains(e)) continue;
      const b = e.getBoundingClientRect().bottom;
      if (b > bottom) { bottom = b; last = e.tagName + (e.textContent.trim().slice(0, 20) ? `("${e.textContent.trim().slice(0, 20)}")` : ""); }
    }
    const kaydet = [...document.querySelectorAll("button")].filter((e) => vis(e) && e.textContent.trim() === "Kaydet").pop();
    const br = banner.getBoundingClientRect();
    return {
      bannerTop: br.top, bannerBottom: br.bottom, tabTop: tabBar?.getBoundingClientRect().top ?? null,
      contentBottom: bottom, last, kaydetBottom: kaydet?.getBoundingClientRect().bottom ?? null,
      atBottom: Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1,
      spacerTop: spacer.getBoundingClientRect().top, spacerBottom: spacer.getBoundingClientRect().bottom,
    };
  }, TR.banner);
  const f = (n) => Math.round(n * 10) / 10;
  if (!m) { check(`${path}: banner present for the layout measurements`, false); await ctx.close(); continue; }
  check(`${path}: scrolled to the bottom (test is meaningful)`, m.atBottom);
  check(`${path}: last content ends above the banner`, m.contentBottom <= m.bannerTop + 0.5, `content=${f(m.contentBottom)} (${m.last}) banner.top=${f(m.bannerTop)}`);
  if (path === "/account") check("/account: the last \"Kaydet\" ends above the banner", m.kaydetBottom !== null && m.kaydetBottom <= m.bannerTop + 0.5, `kaydet=${m.kaydetBottom && f(m.kaydetBottom)} banner.top=${f(m.bannerTop)}`);
  check(`${path}: banner bottom <= tab bar top`, m.tabTop !== null && m.bannerBottom <= m.tabTop + 0.5, `banner.bottom=${f(m.bannerBottom)} tabbar.top=${m.tabTop && f(m.tabTop)}`);
  await ctx.close();
}

// 9. TR -> EN switch: the banner stays (English) and "Install" still calls prompt().
{
  const { ctx, page } = await fresh({ email: "member@test.local", cfg: { outcome: "dismissed" } });
  await open(page, "/account");
  check("language switch: banner in Turkish first", await hasBanner(page));
  let switched = false;
  for (let i = 0; i < 5 && !switched; i++) {
    const trigger = await visible(page, '[data-skeleton-result="locale-switcher"]:not([disabled])');
    if (trigger) await trigger.click();
    await sleep(400);
    const item = await visible(page, '[role="menuitemradio"]:not([aria-checked="true"])');
    if (item) { await item.click(); switched = true; } else { await page.keyboard.press("Escape"); await sleep(300); }
  }
  check("language switch: switched to English", switched && (await until(() => page.evaluate(() => location.pathname.startsWith("/en")), 8000)));
  check("language switch: banner still shown, in English", await until(() => hasBanner(page, EN.banner), 8000) && Boolean(await bannerButton(page, EN.install, EN.banner)));
  await (await bannerButton(page, EN.install, EN.banner))?.click();
  check('language switch: "Install" still calls prompt()', await until(async () => (await promptCalls(page)) === 1, 3000), `calls=${await promptCalls(page)}`);
  await ctx.close();
}

check("no hydration warnings in the console", hydrationIssues.length === 0, hydrationIssues.slice(0, 3).join(" | "));

await browser.close();
console.log(fails === 0 ? "\nALL PASS" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
