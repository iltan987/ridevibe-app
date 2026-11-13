// Admin lists E2E: /admin/members (everything loaded once; tabs, search by name or email and pages in the browser,
// state in the URL, no server request; a row action that empties the last page clamps it) and /admin/applications
// (server offset pages; odd ?page= / ?status= / stale ?cursor= redirect to the canonical URL).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123), local email sign-in
// (docs/learnings/testing.md, "Testing as a signed-in user locally") and admin@test.local (active, admin role; recipe
// in scripts/e2e/safety-e2e.mjs). Works on a DB with other profiles and applications: totals are read from the DB.
// The script plants its own fixtures through `docker exec … psql` (DB_CONTAINER, local only) and deletes them before
// and after the run:
//   - pending profiles lxp<N>@fixture.invalid ("Liste Fixture N", older than everyone else), as many as make the
//     pending tab exactly 26 + 25k rows: its last page holds one row;
//   - 160 inactive profiles lxi<N>@fixture.invalid, so the inactive tab has 7+ pages (widest pager: 7 numbers + arrows);
//   - 30 'new' and 2 'approved' applications lx-app<N>@fixture.invalid (a second page on the applications list).
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123), OUT_DIR (screenshots, default: OS temp
// dir), DB_CONTAINER (default supabase_db_ridevibe).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launch, newPage, signIn } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) => execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", q], { encoding: "utf8" }).trim();
const num = (q) => Number(sql(q));

function clean() {
  sql("delete from applications where email like 'lx-app%@fixture.invalid'");
  sql("delete from auth.users where email like 'lxp%@fixture.invalid' or email like 'lxi%@fixture.invalid'");
}
clean();
const otherPending = num("select count(*) from profiles where status = 'pending'");
// Pending total 26 + 25k (> 25, one row on the last page).
let plantPending = (((1 - otherPending) % 25) + 25) % 25;
if (otherPending + plantPending <= 25) plantPending += 25;
sql(`insert into auth.users (id, email, raw_user_meta_data, created_at)
  select gen_random_uuid(), format('lxp%s@fixture.invalid', g), jsonb_build_object('full_name', 'Liste Fixture ' || g),
    now() - interval '400 days' - g * interval '1 day'
  from generate_series(1, ${plantPending}) g`);
sql(`insert into auth.users (id, email, raw_user_meta_data, created_at)
  select gen_random_uuid(), format('lxi%s@fixture.invalid', g), jsonb_build_object('full_name', 'Pasif Liste ' || g),
    now() - interval '400 days' - g * interval '1 day'
  from generate_series(1, 160) g`);
// handle_new_user stamps profiles with now(): copy the seeded age so the fixtures sort last (docs/learnings/testing.md).
sql(`update profiles p set created_at = u.created_at from auth.users u
  where u.id = p.id and (u.email like 'lxp%@fixture.invalid' or u.email like 'lxi%@fixture.invalid')`);
sql("update profiles set status = 'inactive' where id in (select id from auth.users where email like 'lxi%@fixture.invalid')");
sql(`insert into applications (status, full_name, phone, email, birth_date, district, side, languages, license_class,
    riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
    expectations, alienating_behaviors, conflict_handling, consent_privacy, consent_rules, privacy_notice_version, created_at)
  select case when g > 30 then 'approved' else 'new' end::application_status, 'Liste Başvuru ' || g, '+90533' || lpad(g::text, 7, '0'), format('lx-app%s@fixture.invalid', g),
    '1990-01-01', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false, array['city'], 'some', false, 'friend',
    array['day_rides'], 'Fixture expectations', 'none', 'talk', true, true, 'e2e', now() - interval '400 days' - g * interval '1 day'
  from generate_series(1, 32) g`);

const statusCount = (status) => num(`select count(*) from profiles where status = '${status}'`);
const fixtureCount = (status) =>
  num(`select count(*) from profiles p join member_contacts c on c.profile_id = p.id where p.status = '${status}' and c.email like '%@fixture.invalid'`);
const PENDING = statusCount("pending");
const ACTIVE = statusCount("active");
const INACTIVE = statusCount("inactive");
const NEW_APPS = num("select count(*) from applications where status = 'new'");
console.log(`INFO pending ${PENDING} (planted ${plantPending}), active ${ACTIVE}, inactive ${INACTIVE}, new applications ${NEW_APPS}`);

const browser = await launch();
async function scenario(name, fn, viewport) {
  const ctx = await browser.createBrowserContext();
  try {
    const page = await newPage(ctx, viewport);
    await signIn(page, "admin@test.local", BASE);
    await fn(page);
  } catch (e) {
    check(`${name}: finished without an exception`, false, e.stack);
  } finally {
    await ctx.close();
  }
}
async function go(page, p) {
  await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(400); // hydration
}
async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await page.evaluate(fn, arg).catch((e) => {
      if (/Execution context was destroyed|Cannot find context/.test(e.message)) return null;
      throw e;
    });
    if (v) return v;
    await sleep(100);
  }
  return null;
}
async function find(page, selector, text = "") {
  const h = await page.evaluateHandle(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find(
        (e) => e.getBoundingClientRect().width > 0 && (!text || new RegExp(text).test(e.textContent + (e.getAttribute("aria-label") ?? ""))),
      ) ?? null,
    selector,
    text,
  );
  return h.asElement();
}
async function click(page, selector, text = "") {
  const el = await find(page, selector, text);
  if (!el) throw new Error(`no visible ${selector} ${text}`);
  await el.evaluate((b) => b.scrollIntoView({ block: "center" })); // the fixed tab bar would eat the click
  await el.click();
}
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `lists-${name}.png`), fullPage: true });
/** Counts requests that go to the server for a page: documents and RSC fetches (incl. prefetches). */
function watchServer(page) {
  let seen = [];
  page.on("request", (r) => {
    const url = r.url();
    if (r.resourceType() === "document" || url.includes("_rsc=") || r.headers()["rsc"]) seen.push(`${r.resourceType()} ${url.replace(BASE, "")}`);
  });
  return { reset: () => (seen = []), count: () => seen.length, list: () => seen };
}
/** The visible list as painted in the next animation frame: tab counts, pressed tab, rows, box text, pager. */
const listState = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => {
          const vis = (e) => e.getBoundingClientRect().width > 0;
          const chips = [...document.querySelectorAll("[data-skeleton-result=admin-chips] button, nav[data-skeleton-result=admin-chips] a")].filter(vis);
          const nav = [...document.querySelectorAll("nav[data-skeleton-result=pager]")].find(vis);
          resolve({
            counts: Object.fromEntries(chips.map((c) => [c.firstChild.textContent, Number(c.lastElementChild?.textContent)])),
            tab: chips.find((c) => c.getAttribute("aria-pressed") === "true" || c.getAttribute("aria-current") === "page")?.firstChild.textContent ?? null,
            rows: [...document.querySelectorAll("li[data-skeleton-result=admin-row]")].filter(vis).map((li) => li.querySelector("p, span.font-semibold")?.textContent.trim()),
            value: [...document.querySelectorAll("input[type=search]")].find(vis)?.value ?? null,
            page: nav?.querySelector("[aria-current=page]")?.textContent ?? (nav ? "1" : null),
            pages: [...(nav?.querySelectorAll("[aria-label^='Sayfa '], [aria-label^='Page ']") ?? [])].map((b) => b.textContent).join(),
            range: nav?.querySelector("p")?.textContent ?? null,
          });
        }),
      ),
  );
/** The visible pager's button row: on one line, inside the page, and no sideways scrolling anywhere. */
const pagerFit = (page) =>
  page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav[data-skeleton-result=pager]")].find((n) => n.getBoundingClientRect().width > 0);
    const row = nav?.querySelector("div");
    if (!row) return { found: false };
    const tops = new Set([...row.children].map((c) => Math.round(c.getBoundingClientRect().top)));
    const r = row.getBoundingClientRect();
    const doc = document.documentElement;
    return {
      oneRow: tops.size === 1,
      fits: r.left >= 0 && r.right <= document.body.clientWidth && doc.scrollWidth <= doc.clientWidth,
      items: row.children.length,
      width: Math.round(r.width),
      body: document.body.clientWidth,
    };
  });
async function clearAndType(page, value) {
  const input = await find(page, "input[type=search]");
  await input.focus();
  await page.keyboard.down("Control");
  await page.keyboard.press("a");
  await page.keyboard.up("Control");
  await page.keyboard.press("Backspace");
  if (value) await input.type(value, { delay: 0 });
}
const search = (page) => page.evaluate(() => location.search);
const fmt = (s) => JSON.stringify({ ...s, rows: s.rows.length > 3 ? `${s.rows.length} rows` : s.rows });

// 1 /admin/members: tabs, search by email, pages — in the browser, no request
await scenario("admin members", async (page) => {
  const server = watchServer(page);
  await go(page, "/admin/members");
  const s0 = await listState(page);
  check("members: pending tab by default with the DB counts", s0.tab === "Onay bekleyen" && s0.counts["Onay bekleyen"] === PENDING && s0.counts.Aktif === ACTIVE && s0.counts.Pasif === INACTIVE, fmt(s0));
  check("members: first page of 25, range line", s0.rows.length === 25 && s0.range === `1–25 / ${PENDING} kişi`, fmt(s0));
  await shot(page, "admin-members");

  server.reset();
  await clearAndType(page, "pending-noapp@test");
  const byEmail = await listState(page);
  check("members: search by email finds the person in the next frame", byEmail.rows.join() === "Bekleyen Fixture" && byEmail.value === "pending-noapp@test", fmt(byEmail));
  check("members: tab counts follow the search", byEmail.counts["Onay bekleyen"] === 1 && byEmail.counts.Aktif === 0 && byEmail.counts.Pasif === 0, fmt(byEmail));
  check("members: URL ?q=pending-noapp%40test", !!(await until(page, () => location.search === "?q=pending-noapp%40test", null)), await search(page));

  await clearAndType(page, "@fixture.invalid");
  const fx = await listState(page);
  const want = { pending: fixtureCount("pending"), active: fixtureCount("active"), inactive: fixtureCount("inactive") };
  check("members: counts follow a search over many rows (fixture domain)", fx.counts["Onay bekleyen"] === want.pending && fx.counts.Aktif === want.active && fx.counts.Pasif === want.inactive, `${fmt(fx)} want ${JSON.stringify(want)}`);
  await click(page, "[data-skeleton-result=admin-chips] button", "^Pasif");
  const inactiveTab = await listState(page);
  check("members: tab tap shows that tab in the next frame, search kept", inactiveTab.tab === "Pasif" && inactiveTab.value === "@fixture.invalid" && inactiveTab.rows.length === 25 && !!(await until(page, () => location.search === "?status=inactive&q=%40fixture.invalid", null)), `${fmt(inactiveTab)} ${await search(page)}`);
  await click(page, "nav[data-skeleton-result=pager] button", "Sayfa 2$");
  const p2 = await listState(page);
  check("members: page tap shows page 2 in the next frame", p2.page === "2" && p2.range === `26–50 / ${want.inactive} kişi` && !!(await until(page, () => location.search === "?status=inactive&q=%40fixture.invalid&page=2", null)), `${fmt(p2)} ${await search(page)}`);
  await clearAndType(page, "");
  const cleared = await listState(page);
  check("members: clearing the search keeps the tab, drops the page", cleared.tab === "Pasif" && cleared.page === "1" && !!(await until(page, () => location.search === "?status=inactive", null)), `${fmt(cleared)} ${await search(page)}`);
  await click(page, "[data-skeleton-result=admin-chips] button", "^Onay bekleyen");
  check("members: back on the default tab, the URL has no query", !!(await until(page, () => location.search === "", null)), await search(page));
  await sleep(1500);
  check("members: tabs, search and pages made no document or RSC request", server.count() === 0, server.list().join(" | "));

  await page.goBack();
  await sleep(300);
  const back = await listState(page);
  check("members: back restores the inactive tab", back.tab === "Pasif" && (await search(page)) === "?status=inactive", `${fmt(back)} ${await search(page)}`);

  // URL fixes (replaceState): default spelled out, unknown tab, past the end, repeated, stale cursor.
  for (const [from, to] of [
    ["/admin/members?status=pending", ""],
    ["/admin/members?status=bogus&q=fixture", "?q=fixture"],
    ["/admin/members?page=99", "?page=2"],
    ["/admin/members?page=0", ""],
    ["/admin/members?page=2&page=3", ""],
    ["/admin/members?cursor=MjAyNi0xMS0wOFQx&status=active", "?status=active"],
  ]) {
    await go(page, from);
    check(`members URL fix: ${from} -> ${to || "(no query)"}`, !!(await until(page, (to) => location.search === to, to)), await search(page));
  }
});

// 2 the widest pager (7 pages, page 4: 7 numbers + 2 arrows) on a phone
for (const width of [390, 360]) {
  await scenario(`pager ${width}`, async (page) => {
    await go(page, "/admin/members?status=inactive&page=4");
    const fit = await pagerFit(page);
    const s = await listState(page);
    const name = `widest pager at ${width}px (${s.pages}): one row, no horizontal overflow`;
    if (width === 390) check(name, s.pages.split(",").length === 7 && fit.items === 9 && fit.oneRow && fit.fits, JSON.stringify(fit));
    else console.log(`INFO ${name}: ${fit.oneRow && fit.fits ? "fits" : "DOES NOT FIT"} ${JSON.stringify(fit)}`);
    await shot(page, `pager-${width}`);
  }, { width, height: 844, isMobile: true, hasTouch: true });
}

// 3 a row action that empties the last page: the page is clamped, counts update
await scenario("admin action clamps", async (page) => {
  await go(page, "/admin/members?page=2");
  const before = await listState(page);
  check("action: page 2 of the pending tab holds one row", before.page === "2" && before.rows.length === 1, fmt(before));
  const name = before.rows[0];
  await click(page, "li[data-skeleton-result=admin-row] button", "^Aktifleştir$");
  const clamped = await until(page, () => location.search === "", null);
  await sleep(500);
  const after = await listState(page);
  check("action: URL clamped to page 1 (no query)", !!clamped, await search(page));
  check("action: the row is gone, page 1 shows 25 rows, counts updated", !after.rows.includes(name) && after.rows.length === 25 && after.page === "1" && after.counts["Onay bekleyen"] === PENDING - 1 && after.counts.Aktif === ACTIVE + 1, fmt(after));
  check("action: the profile is active in the DB", sql(`select status from profiles p join member_contacts c on c.profile_id = p.id where p.full_name = '${name}' and c.email like 'lxp%'`) === "active");
});

// 4 English: the /en prefix stays
await scenario("admin members en", async (page) => {
  await go(page, "/en/admin/members");
  await clearAndType(page, "liste fixture 1");
  check("English: typing keeps the /en prefix", !!(await until(page, () => location.pathname + location.search === "/en/admin/members?q=liste+fixture+1", null)), page.url().replace(BASE, ""));
  const s = await listState(page);
  const n = num("select count(*) from profiles where status = 'pending' and full_name ~ '^Liste Fixture 1[0-9]?$'");
  check("English: range line", s.range === `1–${n} of ${n} people` && s.rows.length === n, fmt(s));
  await click(page, "[data-skeleton-result=admin-chips] button", "^Active");
  check("English: tab tap keeps the /en prefix", !!(await until(page, () => location.pathname + location.search === "/en/admin/members?status=active&q=liste+fixture+1", null)), page.url().replace(BASE, ""));
});

// 5 /admin/applications: server pages and redirects
await scenario("applications", async (page) => {
  await go(page, "/admin/applications");
  const s1 = await listState(page);
  const LAST = Math.ceil(NEW_APPS / 25);
  check("applications: first page of 25, pages from 1-2", s1.rows.length === 25 && s1.pages.startsWith("1,2") && s1.range === `1–25 / ${NEW_APPS} başvuru`, fmt(s1));
  check("applications: pager at 390px fits", (await pagerFit(page)).fits && (await pagerFit(page)).oneRow, JSON.stringify(await pagerFit(page)));
  await click(page, "nav[data-skeleton-result=pager] a", "Sayfa 2$");
  await until(page, () => location.search === "?page=2", null);
  await sleep(800);
  const s2 = await listState(page);
  check("applications: page link 2 -> ?page=2", s2.page === "2" && s2.rows.length === Math.min(25, NEW_APPS - 25) && s2.range === `26–${Math.min(50, NEW_APPS)} / ${NEW_APPS} başvuru`, fmt(s2));
  await go(page, "/admin/applications?page=2");
  check("applications: ?page=2 loads directly", (await listState(page)).page === "2");
  for (const [from, to] of [
    ["/admin/applications?page=abc", ""],
    ["/admin/applications?page=99", `?page=${LAST}`],
    ["/admin/applications?page=1", ""],
    ["/admin/applications?page=0", ""],
    ["/admin/applications?page=2&page=3", ""],
    ["/admin/applications?status=new", ""],
    ["/admin/applications?status=bogus&page=2", "?page=2"],
    ["/admin/applications?cursor=MjAyNi0xMS0wOFQx", ""],
    ["/admin/applications?status=approved&page=5", "?status=approved"],
  ]) {
    await go(page, from);
    const ok = await until(page, (to) => location.search === to, to);
    const s = await listState(page);
    check(`applications redirect: ${from} -> ${to || "(no query)"}`, !!ok && s.rows.length > 0, `${await search(page)} ${s.rows.length} rows`);
  }
});

clean();
await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
