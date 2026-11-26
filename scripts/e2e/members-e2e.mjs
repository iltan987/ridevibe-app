// Members directory + profile editing E2E. Needs a production server on :3123 (pnpm build && pnpm start -p 3123),
// email sign-in enabled locally (docs/learnings/testing.md, "Testing as a signed-in user locally") and these fixtures:
//   member@test.local        active, "Test Üye", Kadıköy, birth date 17 May, no bikes, no Instagram
//   second@test.local        active, "Çelik Fixture", Beşiktaş, bike Honda CB500, birthday 9 March + Instagram "celikfx" shown
//   nobirth@test.local       active, no birth date (the script resets it; section 5 enters one)
//   pending-noapp@test.local pending
//   + 26 more active profiles (so the directory has 29 members > PAGE_SIZE 25)
// Fixture recipe (local stack only; the DB must hold no other active members, e.g. right after `pnpm db:reset`):
//   1. Users that sign in, via the admin API (password test-password-123; SECRET_KEY from `pnpm exec supabase status -o env`):
//        for u in member second nobirth pending-noapp; do curl -sf -o /dev/null -X POST \
//          http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
//          -d "{\"email\":\"$u@test.local\",\"password\":\"test-password-123\",\"email_confirm\":true}"; done
//   2. The rest by SQL: docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
//        insert into auth.users (id, email, raw_user_meta_data)
//          select gen_random_uuid(), format('fx%s@fixture.invalid', g), jsonb_build_object('full_name', 'Fixture Üye ' || g)
//          from generate_series(1, 26) g;
//        update profiles set status = 'active' where id in (select id from auth.users where email like '%@fixture.invalid'
//          or email in ('member@test.local', 'second@test.local', 'nobirth@test.local'));
//        update profiles p set full_name = v.name, district = v.district, side = v.side::istanbul_side
//          from auth.users u, (values ('member@test.local', 'Test Üye', 'Kadıköy', 'asian'),
//            ('second@test.local', 'Çelik Fixture', 'Beşiktaş', 'european'), ('nobirth@test.local', 'Tarihsiz Fixture', null, null),
//            ('pending-noapp@test.local', 'Bekleyen Fixture', null, null)) v(email, name, district, side)
//          where u.email = v.email and p.id = u.id;
//        update member_details d set birth_date = '1990-05-17' from auth.users u where u.email = 'member@test.local' and d.profile_id = u.id;
//        update member_details d set birth_date = '1992-03-09', instagram = 'celikfx', show_instagram = true, show_birthday = true
//          from auth.users u where u.email = 'second@test.local' and d.profile_id = u.id;
//        insert into member_motorcycles (profile_id, brand, model, cc)
//          select id, 'Honda', 'CB500', 500 from auth.users where email = 'second@test.local';
//      SQL
//   Cleanup: delete from auth.users where email like '%@fixture.invalid' or email in ('member@test.local',
//     'second@test.local', 'nobirth@test.local', 'pending-noapp@test.local');  (cascades to profiles and member data)
// Env: PUPPETEER_DIR (required), OUT_DIR (screenshots, default: OS temp dir), DB_CONTAINER (default supabase_db_ridevibe).
// The script plants and removes extra bikes for the 10-bike cap through `docker exec psql` (local database only).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { clearAndType, launch, newPage, pagerFit, signIn, watchServer } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) =>
  execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();

const browser = await launch();

/** Fresh Turkish context, optionally signed in. */
async function fresh(email) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  if (email) await signIn(page, email);
  return { ctx, page };
}
async function go(page, p) {
  await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(400); // hydration
}
/** Visible text of the whole page (old routes stay hidden in the DOM). */
const bodyText = (page) => page.evaluate(() => document.body.innerText);
/** Polls until fn (run in the page) returns truthy. Returns the value or null on timeout. */
async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    // A navigation in flight destroys the execution context: treat it as "not yet" and poll again.
    const v = await page.evaluate(fn, arg).catch((e) => {
      if (/Execution context was destroyed|Cannot find context/.test(e.message)) return null;
      throw e;
    });
    if (v) return v;
    await sleep(100);
  }
  return null;
}
/** First visible element matching selector (and text regexp source), as a handle. */
async function find(page, selector, text = "") {
  const h = await page.evaluateHandle(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find(
        (e) =>
          e.getBoundingClientRect().width > 0 &&
          (!text || new RegExp(text).test(e.textContent + (e.getAttribute("aria-label") ?? ""))),
      ) ?? null,
    selector,
    text,
  );
  return h.asElement();
}
async function click(page, selector, text = "") {
  const el = await find(page, selector, text);
  if (!el) return false;
  await el.evaluate((b) => b.scrollIntoView({ block: "center" })); // the fixed tab bar would eat the click
  await el.click();
  return true;
}
async function typeInto(el, value) {
  await el.focus();
  await el.click({ clickCount: 1 });
  await el.evaluate((i) => i.select());
  await el.press("Backspace");
  await el.type(value);
}
const hasText = (page, re) =>
  until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags], 8000);
const dialogGone = (page, role = "dialog") =>
  until(
    page,
    (r) => ![...document.querySelectorAll(`[role=${r}]`)].some((e) => e.getBoundingClientRect().width > 0),
    role,
  );
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `members-${name}.png`), fullPage: true });
/** The switch inside the visible label with this text. */
const switchFor = (page, text) =>
  page.evaluateHandle(
    (text) =>
      [...document.querySelectorAll("label")]
        .filter((l) => l.getBoundingClientRect().width > 0 && l.textContent.includes(text))
        .map((l) => l.querySelector("[role=switch]"))[0] ?? null,
    text,
  );
const memberCard = (page, name) =>
  page.evaluate(
    (name) =>
      [...document.querySelectorAll("li[data-skeleton-result=members-row]")].find((li) => li.textContent.includes(name))
        ?.innerText ?? null,
    name,
  );
/** Clicks the "Kaydet" submit of the visible form holding `inner`: a selector, or "text:<label text>" for a switch. */
const saveForm = async (page, inner) => {
  const handle = (
    await page.evaluateHandle((inner) => {
      const vis = (e) => e.getBoundingClientRect().width > 0;
      const el = inner.startsWith("text:")
        ? [...document.querySelectorAll("label")]
            .filter((l) => vis(l) && l.textContent.includes(inner.slice(5)))
            .map((l) => l.querySelector("[role=switch]"))[0]
        : [...document.querySelectorAll(inner)].find(vis);
      return (
        [...(el?.closest("form")?.querySelectorAll("button[type=submit]") ?? [])].find(
          (b) => b.textContent.trim() === "Kaydet",
        ) ?? null
      );
    }, inner)
  ).asElement();
  if (!handle) return false;
  await handle.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await handle.click();
  return true;
};

const total = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-skeleton-result=members-total] p")].find(
        (p) => p.getBoundingClientRect().width > 0,
      )?.textContent ?? null,
  );
/** Names on the visible cards. */
const names = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")]
      .filter((p) => p.getBoundingClientRect().width > 0)
      .map((p) => p.textContent),
  );
/** Page numbers, current page and range line of the visible pager. */
const pagerState = (page) =>
  page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav[data-skeleton-result=pager]")].find(
      (n) => n.getBoundingClientRect().width > 0,
    );
    return {
      pages: [...(nav?.querySelectorAll("[aria-label^='Sayfa '], [aria-label^='Page ']") ?? [])]
        .map((b) => b.textContent)
        .join(),
      current: nav?.querySelector("[aria-current=page]")?.textContent ?? null,
      range: nav?.querySelector("p")?.textContent ?? null,
    };
  });
/** Logs, per animation frame, whether a Suspense fallback (`data-skeleton`) is visible and the search box text
 *  (`values`: each change, as painted). */
const trackFrames = (page) =>
  page.evaluate(() => {
    window.__frames = { frames: 0, skeleton: 0, values: [] };
    const tick = () => {
      const f = window.__frames;
      f.frames++;
      if ([...document.querySelectorAll("[data-skeleton]")].some((e) => e.getBoundingClientRect().width > 0))
        f.skeleton++;
      const value = [...document.querySelectorAll("input[type=search]")].find(
        (e) => e.getBoundingClientRect().width > 0,
      )?.value;
      if (value !== undefined && value !== f.values.at(-1)) f.values.push(value);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
const framesSeen = (page) => page.evaluate(() => window.__frames);
/** The directory as painted in the next animation frame: box text, card names, total, pressed chip, pager. */
const nextFrame = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const vis = (e) => e.getBoundingClientRect().width > 0;
          const nav = [...document.querySelectorAll("nav[data-skeleton-result=pager]")].find(vis);
          resolve({
            value: [...document.querySelectorAll("input[type=search]")].find(vis)?.value ?? null,
            names: [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")]
              .filter(vis)
              .map((p) => p.textContent),
            total:
              [...document.querySelectorAll("[data-skeleton-result=members-total] p")].find(vis)?.textContent ?? null,
            chip:
              [...document.querySelectorAll("[data-skeleton-result=members-chips] button[aria-pressed=true]")].find(vis)
                ?.firstChild?.textContent ?? null,
            page: nav?.querySelector("[aria-current=page]")?.textContent ?? (nav ? "1" : null),
            range: nav?.querySelector("p")?.textContent ?? null,
          });
        }),
      ),
  );
const clickChip = (page, label) => click(page, "[data-skeleton-result=members-chips] button", `^${label}`);
const clickPage = (page, n) => click(page, "nav[data-skeleton-result=pager] button", `Sayfa ${n}$|Page ${n}$`);

/** Sets a controlled input's value the way React notices (typing into type=date depends on the browser locale). */
async function setInputValue(page, selector, value) {
  await page.evaluate(
    (selector, value) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    },
    selector,
    value,
  );
}

const MEMBER_ID = sql("select id from auth.users where email = 'member@test.local'");
const NOBIRTH_ID = sql("select id from auth.users where email = 'nobirth@test.local'");
// Start from a known state (re-runs).
sql(`delete from member_motorcycles where profile_id = '${MEMBER_ID}'`);
sql(`update profiles set district = 'Kadıköy', side = 'asian' where id = '${MEMBER_ID}'`);
sql(
  `update member_details set instagram = null, show_instagram = false, show_birthday = false, consent_photos = false, consent_photos_at = null, consent_photos_version = null where profile_id = '${MEMBER_ID}'`,
);
sql(`update member_details set birth_date = null, show_birthday = true where profile_id = '${NOBIRTH_ID}'`); // the default (opt-out)

// 1 anonymous
{
  const { ctx, page } = await fresh();
  await go(page, "/members");
  const url = page.url();
  check(
    "anonymous /members -> sign-in with next",
    url.includes("/sign-in") && url.includes("next=%2Fmembers"),
    url.replace(BASE, ""),
  );
  await ctx.close();
}

// 2 pending
{
  const { ctx, page } = await fresh("pending-noapp@test.local");
  await go(page, "/members");
  const text = await bodyText(page);
  check("pending: 'active members only' card", text.includes("Üye listesi aktif üyelere açık"));
  check("pending: no member cards", (await memberCard(page, "Fixture")) === null);
  await shot(page, "pending");
  await ctx.close();
}

// 3 directory as an active member: search, chips and pages run in the browser (state in the URL, no server request)
{
  const { ctx, page } = await fresh("member@test.local");
  const server = watchServer(page, BASE);
  await go(page, "/members");
  const text = await bodyText(page);
  check("directory: total shown", (await total(page)) === "29 üye", await total(page));
  check("directory: first page has 25 cards", (await names(page)).length === 25, String((await names(page)).length));
  check(
    "directory: side chips with counts",
    /Tümü\s*29/.test(text) && /Anadolu\s*1/.test(text) && /Avrupa\s*1/.test(text),
    text.match(/Tümü[\s\S]{0,40}/)?.[0],
  );
  check(
    "directory: pager shows pages 1-2 and the range",
    (await pagerState(page)).pages === "1,2" && (await pagerState(page)).range === "1–25 / 29 üye",
    JSON.stringify(await pagerState(page)),
  );
  const fit = await pagerFit(page);
  check("pager at 390px: one row, no horizontal overflow", fit.oneRow && fit.fits, JSON.stringify(fit));
  await shot(page, "directory");

  // (a) typing narrows the list at once (checked in the first animation frame after the last key), no skeleton,
  // no request to the server; zero-delay typing ends with exactly the typed text.
  await trackFrames(page);
  server.reset();
  const input = await find(page, "input[type=search]");
  await input.type("çel", { delay: 0 });
  const typed = await nextFrame(page);
  check(
    "search: 'çel' narrows the list in the next frame",
    typed.value === "çel" && typed.names.join() === "Çelik Fixture" && typed.total === "1 üye",
    JSON.stringify(typed),
  );
  // (b) the URL carries only the search
  check(
    "search: URL is ?q=%C3%A7el",
    !!(await until(page, () => location.search === "?q=%C3%A7el", null)),
    await page.evaluate(() => location.search),
  );
  const card = await memberCard(page, "Çelik Fixture");
  check(
    "card shows district, side, bike, birthday and Instagram",
    !!card &&
      /Beşiktaş · Avrupa/.test(card) &&
      /Honda CB500 · 500 cc/.test(card) &&
      /9 Mart/.test(card) &&
      /@celikfx/.test(card),
    JSON.stringify(card),
  );
  await shot(page, "search");
  // Folded search: without Turkish letters, and capitals.
  await clearAndType(page, "CELIK");
  check("search: 'CELIK' finds 'Çelik Fixture' (folded)", (await nextFrame(page)).names.join() === "Çelik Fixture");
  await clearAndType(page, "");
  await page.evaluate(() => (window.__frames.values = []));
  await clearAndType(page, "fixture üye 1");
  const fast = await nextFrame(page);
  const painted = (await framesSeen(page)).values;
  check(
    "fast typing: the box never flips back (every painted text is a prefix of the next)",
    painted.every((v, i) => i === 0 || v.startsWith(painted[i - 1])),
    JSON.stringify(painted),
  );
  const expected = ["Fixture Üye 1", ...Array.from({ length: 10 }, (_, i) => `Fixture Üye 1${i}`)].sort().join();
  check(
    "fast typing (no delay): box holds exactly the typed text and the list matches",
    fast.value === "fixture üye 1" && [...fast.names].sort().join() === expected,
    JSON.stringify(fast),
  );
  const caughtUp = await until(page, () => location.search === "?q=fixture+%C3%BCye+1", null);
  await sleep(300);
  const settled = await nextFrame(page);
  check(
    "fast typing: after the URL caught up the box still holds the typed text",
    !!caughtUp && settled.value === "fixture üye 1" && settled.names.length === 11,
    JSON.stringify(settled),
  );
  // Clearing leaves no empty q: the URL has no query at all.
  await clearAndType(page, "");
  check(
    "search cleared: URL has no '?'",
    !!(await until(page, () => location.href.endsWith("/members"), null)) && (await names(page)).length === 25,
    page.url().replace(BASE, ""),
  );
  await sleep(300);
  const frames = await framesSeen(page);
  check("typing: no skeleton in any frame", frames.frames > 0 && frames.skeleton === 0, JSON.stringify(frames));
  check("typing: no document or RSC request", server.count() === 0, server.list().join(" | "));

  // (c) reload restores the view
  await clearAndType(page, "çel");
  await until(page, () => location.search === "?q=%C3%A7el", null);
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(400);
  const restored = await nextFrame(page);
  check(
    "reload: ?q=%C3%A7el restores the box and the list",
    restored.value === "çel" && restored.names.join() === "Çelik Fixture",
    JSON.stringify(restored),
  );

  // chips and pages: no request either
  await go(page, "/members");
  await trackFrames(page);
  server.reset();
  await clickChip(page, "Avrupa");
  const euro = await nextFrame(page);
  check(
    "chip 'Avrupa': only European cards, URL ?side=european",
    euro.names.join() === "Çelik Fixture" &&
      euro.chip === "Avrupa" &&
      !!(await until(page, () => location.search === "?side=european", null)),
    JSON.stringify(euro),
  );
  await clickChip(page, "Tümü");
  await until(page, () => location.search === "", null);
  await clickPage(page, "2");
  const p2 = await nextFrame(page);
  check(
    "page 2: the remaining 4 members, URL ?page=2, range 26–29",
    p2.names.length === 4 &&
      p2.range === "26–29 / 29 üye" &&
      !!(await until(page, () => location.search === "?page=2", null)),
    JSON.stringify(p2),
  );
  await clickPage(page, "1");
  await until(page, () => location.search === "", null);
  check(
    "chips and pages: no skeleton in any frame",
    (await framesSeen(page)).skeleton === 0,
    JSON.stringify(await framesSeen(page)),
  );
  check("chips and pages: no document or RSC request", server.count() === 0, server.list().join(" | "));

  // (d) back / forward walk: box, chip, page and list follow the URL
  await go(page, "/members");
  await clearAndType(page, "fix"); // replaces the entry: ?q=fix (28 matches: two pages)
  await until(page, () => location.search === "?q=fix", null);
  await clickPage(page, "2"); // push ?q=fix&page=2
  await until(page, () => location.search === "?q=fix&page=2", null);
  await clearAndType(page, "çel"); // replaces that entry: ?q=%C3%A7el
  await until(page, () => location.search === "?q=%C3%A7el", null);
  await clickChip(page, "Avrupa"); // push ?q=%C3%A7el&side=european
  await until(page, () => location.search === "?q=%C3%A7el&side=european", null);
  server.reset();
  const walk = [];
  const step = async (label, move) => {
    await move();
    await sleep(300);
    walk.push({
      label,
      search: await page.evaluate(() => decodeURIComponent(location.search)),
      ...(await nextFrame(page)),
    });
  };
  await step("back", () => page.goBack());
  await step("back", () => page.goBack());
  await step("forward", () => page.goForward());
  await step("forward", () => page.goForward());
  const [b1, b2, f1, f2] = walk;
  const fmt = JSON.stringify(
    walk.map(({ label, search, value, chip, names, page }) => ({ label, search, value, chip, page, n: names.length })),
  );
  check(
    "back: ?q=çel — box 'çel', chip Tümü, 1 card",
    b1.search === "?q=çel" && b1.value === "çel" && b1.chip === "Tümü" && b1.names.join() === "Çelik Fixture",
    fmt,
  );
  check(
    "back: ?q=fix — box 'fix', page 1 of 2 (25 cards)",
    b2.search === "?q=fix" && b2.value === "fix" && b2.chip === "Tümü" && b2.names.length === 25 && b2.page === "1",
    fmt,
  );
  check(
    "forward: ?q=çel — box 'çel' again",
    f1.search === "?q=çel" && f1.value === "çel" && f1.names.join() === "Çelik Fixture",
    fmt,
  );
  check(
    "forward: ?q=çel&side=european — chip Avrupa",
    f2.search === "?q=çel&side=european" &&
      f2.value === "çel" &&
      f2.chip === "Avrupa" &&
      f2.names.join() === "Çelik Fixture",
    fmt,
  );
  check("back / forward: no document or RSC request", server.count() === 0, server.list().join(" | "));

  // (e) odd URLs are corrected in place (replaceState): clamped page, invalid side, stale keyset cursor
  for (const [from, to, n] of [
    ["/members?page=99", "?page=2", 4],
    ["/members?page=abc", "", 25],
    ["/members?page=1", "", 25],
    ["/members?page=2&page=3", "", 25],
    ["/members?side=north&page=2", "?page=2", 4],
    ["/members?cursor=MjAyNi0xMS0wOFQx&q=fix", "?q=fix", 25],
  ]) {
    await go(page, from);
    const fixed = await until(page, (to) => location.search === to, to);
    check(
      `URL fix: ${from} -> ${to || "(no query)"}`,
      !!fixed && (await names(page)).length === n,
      `${await page.evaluate(() => location.search)} ${(await names(page)).length} cards`,
    );
  }

  // (f) server time of /members (document): logged for docs/follow-ups.md
  const times = [];
  for (let i = 0; i < 5; i++) {
    await page.goto(BASE + "/members", { waitUntil: "networkidle0" });
    times.push(
      await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0];
        return {
          responseStart: Math.round(n.responseStart - n.requestStart),
          responseEnd: Math.round(n.responseEnd - n.requestStart),
        };
      }),
    );
  }
  console.log(
    `INFO /members document timing (ms since request; responseEnd = the streamed directory is in): ${JSON.stringify(times)}`,
  );
  await ctx.close();
}

// 4 account: location, bikes, toggles, consent
{
  const { ctx, page } = await fresh("member@test.local");
  await go(page, "/account");
  await shot(page, "account");

  // name locked
  const nameInputs = await page.evaluate(() =>
    [...document.querySelectorAll("input")]
      .filter((i) => i.getBoundingClientRect().width > 0 && (/name/i.test(i.name) || i.value === "Test Üye"))
      .map((i) => i.name || i.id),
  );
  const hint = (await bodyText(page)).includes("İsim değişikliği için kulüp ekibine yaz.");
  check(
    "account: no name input, hint shown",
    nameInputs.filter((n) => !/city|district|brand|model/.test(n)).length === 0 && hint,
    JSON.stringify(nameInputs),
  );

  // district
  await page.select("#profile-district", "Beşiktaş");
  await saveForm(page, "#profile-district");
  check("location: district change shows 'Kaydedildi.'", !!(await hasText(page, /Kaydedildi\./)));
  await go(page, "/account");
  const district = await page.$eval("#profile-district", (s) => s.value);
  check("location: district persisted after reload", district === "Beşiktaş", district);
  await go(page, "/members?q=Test");
  const c1 = await memberCard(page, "Test Üye");
  check("location: directory shows Beşiktaş · Avrupa", !!c1 && /Beşiktaş · Avrupa/.test(c1), JSON.stringify(c1));

  // add bike
  await go(page, "/account");
  await click(page, "button", "Motosiklet ekle");
  await until(
    page,
    () => [...document.querySelectorAll("[role=dialog]")].some((e) => e.getBoundingClientRect().width > 0),
    null,
  );
  await typeInto(await find(page, "[role=dialog] input[name=brand]"), "Yamaha");
  await typeInto(await find(page, "[role=dialog] input[name=model]"), "MT-07");
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "689");
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check("bike add: dialog closes", !!(await dialogGone(page)));
  check("bike add: appears on /account", !!(await hasText(page, /Yamaha MT-07 · 689 cc/)));
  await go(page, "/members?q=Test");
  const c2 = await memberCard(page, "Test Üye");
  check("bike add: appears in /members", !!c2 && /Yamaha MT-07 · 689 cc/.test(c2), JSON.stringify(c2));

  // invalid cc blocked
  await go(page, "/account");
  await click(page, "button", "Yamaha MT-07 · 689 cc motosikletini düzenle");
  await until(
    page,
    () => [...document.querySelectorAll("[role=dialog]")].some((e) => e.getBoundingClientRect().width > 0),
    null,
  );
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "5");
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check(
    "bike edit: cc=5 rejected with a message, dialog stays open",
    !!(await hasText(page, /50 ile 3000 arasında bir sayı gir/)) && !!(await find(page, "[role=dialog]")),
  );

  // edit
  await typeInto(await find(page, "[role=dialog] input[name=model]"), "MT-09");
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "890");
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check("bike edit: dialog closes", !!(await dialogGone(page)));
  check(
    "bike edit: new name shown, old gone",
    !!(await hasText(page, /Yamaha MT-09 · 890 cc/)) && !(await bodyText(page)).includes("MT-07"),
  );

  // delete
  await click(page, "button", "Yamaha MT-09 · 890 cc motosikletini sil");
  await until(
    page,
    () => [...document.querySelectorAll("[role=alertdialog]")].some((e) => e.getBoundingClientRect().width > 0),
    null,
  );
  await shot(page, "delete-confirm");
  await click(page, "[role=alertdialog] button", "^Sil$");
  check("bike delete: confirm closes", !!(await dialogGone(page, "alertdialog")));
  check("bike delete: list empty message shown", !!(await hasText(page, /Henüz motosiklet eklemedin\./)));
  await go(page, "/members?q=Test");
  const c3 = await memberCard(page, "Test Üye");
  check("bike delete: gone from /members", !!c3 && !/Yamaha/.test(c3), JSON.stringify(c3));

  // 10-bike cap (planted by SQL: the UI path was exercised above)
  sql(
    `insert into member_motorcycles(profile_id, brand, model) select '${MEMBER_ID}', 'Fixture', 'Bike ' || g from generate_series(1, 10) g`,
  );
  await go(page, "/account");
  const addBtn = await find(page, "button", "Motosiklet ekle");
  const disabled = await addBtn.evaluate((b) => b.disabled);
  check(
    "10 bikes: add button disabled with limit hint",
    disabled && (await bodyText(page)).includes("En fazla 10 motosiklet ekleyebilirsin."),
  );
  await shot(page, "bike-cap");
  const ten = await page.evaluate(
    () => document.querySelectorAll("[data-skeleton-result=profile-motorcycles] ul li").length,
  );
  check("10 bikes: all ten listed", ten === 10, String(ten));
  sql(`delete from member_motorcycles where profile_id = '${MEMBER_ID}'`);

  // Instagram + birthday
  await go(page, "/account");
  await typeInto(await find(page, "#profile-instagram"), "https://www.instagram.com/testig/?igsh=abc");
  await (await switchFor(page, "Instagram'ımı")).asElement().click();
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveForm(page, "#profile-instagram");
  check("visibility: save shows 'Kaydedildi.'", !!(await hasText(page, /Kaydedildi\./)));
  const igNow = await page.$eval("#profile-instagram", (i) => i.value);
  check("visibility: input shows the normalised handle right after saving", igNow === "testig", igNow);
  await go(page, "/account");
  const ig = await page.$eval("#profile-instagram", (i) => i.value);
  check("visibility: Instagram URL normalised to handle", ig === "testig", ig);
  await go(page, "/members?q=Test");
  const c4 = await memberCard(page, "Test Üye");
  check(
    "visibility: directory shows @testig and 17 Mayıs",
    !!c4 && /@testig/.test(c4) && /17 Mayıs/.test(c4),
    JSON.stringify(c4),
  );

  // switch both off again
  await go(page, "/account");
  await (await switchFor(page, "Instagram'ımı")).asElement().click();
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveForm(page, "#profile-instagram");
  await hasText(page, /Kaydedildi\./);
  await go(page, "/members?q=Test");
  const c5 = await memberCard(page, "Test Üye");
  check(
    "visibility: switched off -> directory hides Instagram and birthday",
    !!c5 && !/@testig/.test(c5) && !/Mayıs/.test(c5),
    JSON.stringify(c5),
  );

  // invalid Instagram
  await go(page, "/account");
  await typeInto(await find(page, "#profile-instagram"), "not valid!");
  await saveForm(page, "#profile-instagram");
  check("visibility: invalid Instagram rejected", !!(await hasText(page, /Geçerli bir Instagram kullanıcı adı/)));

  // photo consent
  await go(page, "/account");
  const before = await bodyText(page);
  check(
    "consent: neutral 'not given' without a date before any choice",
    before.includes("İzin verilmedi.") && !before.includes("İzin verdin"),
  );
  await (await switchFor(page, "kulüp galerisinde paylaşılmasına")).asElement().click();
  await saveForm(page, "text:kulüp galerisinde paylaşılmasına");
  check("consent: saving shows the date", !!(await hasText(page, /İzin verdin \(\d{1,2} \p{L}+ \d{4}\)\./u)));
  await shot(page, "consent");
  // Saving an unchanged consent is ok but writes nothing (version and timestamp stay together).
  const consentRow = () =>
    sql(
      `select consent_photos_at || '|' || coalesce(consent_photos_version, '') from member_details where profile_id = '${MEMBER_ID}'`,
    );
  sql(`update member_details set consent_photos_version = 'stale' where profile_id = '${MEMBER_ID}'`);
  const stamped = consentRow();
  await go(page, "/account");
  await saveForm(page, "text:kulüp galerisinde paylaşılmasına");
  check(
    "consent: re-saving unchanged consent shows 'Kaydedildi.' and writes nothing",
    !!(await hasText(page, /Kaydedildi\./)) && consentRow() === stamped,
    consentRow(),
  );
  // Withdrawing: neutral wording, version written with the change.
  await (await switchFor(page, "kulüp galerisinde paylaşılmasına")).asElement().click();
  await saveForm(page, "text:kulüp galerisinde paylaşılmasına");
  check(
    "consent: withdrawing shows 'İzin verilmedi.' and stores the notice version",
    !!(await hasText(page, /İzin verilmedi\./)) && !consentRow().endsWith("|stale"),
    consentRow(),
  );
  await ctx.close();
}

// 5 member without a birth date: enters it once, then it is read-only. Birthday is opt-out (on by default).
{
  const switchState = async (page) =>
    (await switchFor(page, "Doğum günümü")).asElement().evaluate((s) => ({
      enabled:
        !s.hasAttribute("disabled") && s.getAttribute("aria-disabled") !== "true" && s.dataset.disabled === undefined,
      checked: s.getAttribute("aria-checked"),
    }));
  const stored = () =>
    sql(
      `select coalesce(birth_date::text, 'null') || '|' || show_birthday from member_details where profile_id = '${NOBIRTH_ID}'`,
    );
  const { ctx, page } = await fresh("nobirth@test.local");
  await go(page, "/account");
  const state = await switchState(page);
  check(
    "no birth date: birthday switch enabled and shows the stored 'on'",
    state.enabled && state.checked === "true",
    JSON.stringify(state),
  );
  const text = await bodyText(page);
  check(
    "no birth date: 'shown once saved' and 'once' hints shown",
    text.includes("Doğum tarihini kaydettiğinde doğum günün (gün ve ay) gösterilir") &&
      text.includes("Doğum tarihini bir kez girebilirsin"),
  );
  await shot(page, "no-birthdate");

  // Saving visibility without touching the switch keeps the stored default (on).
  await saveForm(page, "#profile-instagram");
  await hasText(page, /Kaydedildi\./);
  check("no birth date: saving visibility keeps show_birthday on", stored() === "null|true", stored());
  await go(page, "/account");

  const input = await find(page, "#profile-birth-date");
  check("no birth date: date field shown", !!input && (await input.evaluate((i) => i.type)) === "date");
  await click(page, "button", "^Doğum tarihini kaydet$");
  check("birth date: empty is rejected", !!(await hasText(page, /Bu alan zorunlu\./)));
  await setInputValue(page, "#profile-birth-date", "2015-01-01");
  await click(page, "button", "^Doğum tarihini kaydet$");
  check(
    "birth date: under 18 is rejected",
    !!(await hasText(page, /18 yaşından büyük olmalısın\./)) && stored().startsWith("null|"),
    stored(),
  );

  // Turn the birthday off first, then save the date with Enter (its own form): it must never be shown.
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await setInputValue(page, "#profile-birth-date", "1988-07-04");
  await page.focus("#profile-birth-date");
  await page.keyboard.press("Enter");
  const shown = await hasText(page, /Doğum tarihi\s*4 Temmuz 1988/);
  check(
    "birth date: Enter saves it, shown read-only, field gone",
    !!shown && !(await find(page, "#profile-birth-date")),
  );
  check("birth date: stored with the switch as shown (off)", stored() === "1988-07-04|false", stored());
  const after = await switchState(page);
  check(
    "birth date: switch still off after saving, hint gone",
    after.enabled && after.checked === "false" && !(await bodyText(page)).includes("kaydettiğinde doğum günün"),
    JSON.stringify(after),
  );
  await shot(page, "birthdate-saved");
  await go(page, "/members?q=Tarihsiz");
  const hidden = await memberCard(page, "Tarihsiz Fixture");
  check(
    "birth date: directory hides the birthday the member turned off",
    !!hidden && !/Temmuz/.test(hidden),
    JSON.stringify(hidden),
  );

  // Switching it on later shows it.
  await go(page, "/account");
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveForm(page, "#profile-instagram");
  await hasText(page, /Kaydedildi\./);
  await go(page, "/members?q=Tarihsiz");
  const card = await memberCard(page, "Tarihsiz Fixture");
  check(
    "birth date: directory shows the birthday once switched on",
    !!card && /4 Temmuz/.test(card),
    JSON.stringify(card),
  );
  await ctx.close();
}

// 6 English
{
  const { ctx, page } = await fresh("member@test.local");
  const server = watchServer(page, BASE);
  await go(page, "/en/members");
  const t = await bodyText(page);
  check(
    "English: /en/members renders translated labels",
    /Members/.test(t) && /Asian side|Anatolian|Asian/.test(t) && !/MISSING_MESSAGE/.test(t),
  );
  check(
    "English: range line",
    (await pagerState(page)).range === "1–25 of 29 members",
    JSON.stringify(await pagerState(page)),
  );
  server.reset();
  await clearAndType(page, "çel");
  check(
    "English: typing keeps the /en prefix",
    !!(await until(page, () => location.pathname + location.search === "/en/members?q=%C3%A7el", null)),
    page.url().replace(BASE, ""),
  );
  await click(page, "[data-skeleton-result=members-chips] button", "^European");
  check(
    "English: chip keeps the /en prefix",
    !!(await until(page, () => location.pathname + location.search === "/en/members?q=%C3%A7el&side=european", null)),
    page.url().replace(BASE, ""),
  );
  check("English: no document or RSC request", server.count() === 0, server.list().join(" | "));
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(400);
  const back = await nextFrame(page);
  check(
    "English: reload restores search and chip",
    back.value === "çel" &&
      back.chip === "European side" &&
      back.names.join() === "Çelik Fixture" &&
      page.url().endsWith("/en/members?q=%C3%A7el&side=european"),
    JSON.stringify(back),
  );
  await go(page, "/en/members?page=2");
  check(
    "English: page 2 via URL, range 26–29",
    (await pagerState(page)).range === "26–29 of 29 members" && (await names(page)).length === 4,
    JSON.stringify(await pagerState(page)),
  );
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
