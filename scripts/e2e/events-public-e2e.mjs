// Events for non-members: the per-event teaser page and its link-preview metadata (PASS/FAIL lines, exit code != 0 on
// failure). Needs a production server on :3123 (pnpm build && pnpm start -p 3123) and email sign-in enabled locally
// (docs/learnings/testing.md, "Testing as a signed-in user locally") with these fixtures:
//   member@test.local        active, no role (the positive control: members still get the full event page)
//   pending-noapp@test.local pending, no application
//   pending-app@test.local   pending, one linked application with status `new` (optional: SKIP without it)
// Fixture recipe: the header of scripts/e2e/probation-e2e.mjs (pending users: keep status `pending`; link the
// application of pending-app via `applications.profile_id`, scripts/e2e/README.md).
// Signed out, on a planted ride: the card (title, area, day; no link), "Giriş yap" (back to this event via `?next=`)
// and "Başvur"; the HTML holds no place name, start time or description. A meet-up shows no area line; a cancelled
// ride says "İptal edildi". A malformed id and an unknown uuid are the 404 page. The pending user gets the card and
// "Başvur" but no "Giriş yap"; pending-app reads "Başvurun inceleniyor" and no "Başvur". The page `<head>` (fetched
// as WhatsApp's crawler, which gets blocking metadata) has the event title as `og:title`, kind · day · area as
// `og:description` (English on `/en`), "İptal edildi · " first for a cancelled event, no start time, and noindex.
// Cached reads: the preview is read per event id through `"use cache"` (`getEventPreview`, tag `events-public`), and
// rows planted by psql never expire that cache. The script plants its rows (fixed ids, same content every run) before
// its first request, so a running server is fine; after changing the fixtures below, restart the server (or rebuild).
// Fixture rows (events titled "E2E Önizleme …" with fixed ids) are planted and deleted through `docker exec psql`
// (DB_CONTAINER, local only) before and after the run. Env: PUPPETEER_DIR (required), OUT_DIR (screenshots), BASE_URL.
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
const sql = (q) =>
  execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();

for (const who of ["member", "pending-noapp"]) {
  if (!sql(`select id from auth.users where email = '${who}@test.local'`)) {
    console.log(`FAIL fixture ${who}@test.local is missing (recipe in the header)`);
    process.exit(1);
  }
}
const hasPendingApp =
  sql(
    "select count(*) from applications a join auth.users u on u.id = a.profile_id where u.email = 'pending-app@test.local' and a.status in ('new', 'contacted')",
  ) === "1";

// Fixed ids (valid v4: Zod's uuid check, docs/learnings/testing.md) so the cached preview of an id never changes.
const RIDE = { id: "00000000-0000-4000-8000-00000000e401", title: "E2E Önizleme Ağva Sürüşü", area: "Üsküdar → Ağva" };
const MEETUP = { id: "00000000-0000-4000-8000-00000000e402", title: "E2E Önizleme Moda Buluşması" };
const CANCELLED = {
  id: "00000000-0000-4000-8000-00000000e403",
  title: "E2E Önizleme İptal Sürüş",
  area: "Kadıköy → Şile",
};
const UNKNOWN = "00000000-0000-4000-8000-00000000e4ff";
// Never in a public page: place names, the start time, the description.
const SECRET = { place: "E2E Gizli", time: "08:30", description: "E2E gizli açıklama" };

/** A start at `hh:mm` Istanbul time, `days` from today (Istanbul). */
const at = (days, hhmm) =>
  `(((now() at time zone 'Europe/Istanbul')::date + ${days}) + time '${hhmm}') at time zone 'Europe/Istanbul'`;

function clean() {
  sql(`delete from events where id in ('${RIDE.id}', '${MEETUP.id}', '${CANCELLED.id}')`);
}
function plant() {
  clean();
  sql(
    `insert into events (id, kind, title, side, area, starts_at, description) values ('${RIDE.id}', 'ride', '${RIDE.title}', 'asian', '${RIDE.area}', ${at(5, SECRET.time)}, '${SECRET.description} metni')`,
  );
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${RIDE.id}', 0, '${SECRET.place} Başlangıç', 41.0255, 29.0154), ('${RIDE.id}', 1, '${SECRET.place} Varış', 41.1710, 29.5560)`,
  );
  sql(
    `insert into events (id, kind, title, side, starts_at) values ('${MEETUP.id}', 'meetup', '${MEETUP.title}', 'asian', ${at(3, "20:00")})`,
  );
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${MEETUP.id}', 0, '${SECRET.place} Kafe', 41.0255, 29.0154)`,
  );
  sql(
    `insert into events (id, kind, title, side, area, starts_at, status, cancelled_at, cancel_reason) values ('${CANCELLED.id}', 'ride', '${CANCELLED.title}', 'asian', '${CANCELLED.area}', ${at(6, "09:00")}, 'cancelled', now(), 'E2E gizli neden')`,
  );
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${CANCELLED.id}', 0, '${SECRET.place} A', 41.0255, 29.0154), ('${CANCELLED.id}', 1, '${SECRET.place} B', 41.1710, 29.5560)`,
  );
}
/** The Istanbul day of a planted event, as the page formats it (weekday long, day, month long). */
function dayText(id, locale) {
  const day = sql(`select (starts_at at time zone 'Europe/Istanbul')::date from events where id = '${id}'`);
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Istanbul",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

const browser = await launch();
async function go(page, p) {
  const res = await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(400); // hydration
  return res;
}
/** Visible h1 texts (textContent: the 404 heading is CSS-uppercased). */
const h1s = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("h1")]
      .filter((h) => h.getBoundingClientRect().width > 0)
      .map((h) => h.textContent.trim()),
  );
/** The visible teaser: its text, links (text, href), heading, struck title. Null when not shown. */
const teaser = (page) =>
  page.evaluate(() => {
    const root = [...document.querySelectorAll("[data-skeleton-result=event-teaser]")].find(
      (e) => e.getBoundingClientRect().width > 0,
    );
    if (!root) return null;
    const h1 = root.querySelector("h1");
    return {
      text: root.innerText,
      allText: root.textContent,
      title: h1?.textContent ?? null,
      struck: h1 ? getComputedStyle(h1).textDecorationLine.includes("line-through") : false,
      links: [...root.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
      cardLinks: [...root.querySelectorAll("article a")].length,
    };
  });
/** Meta tags of a page's HTML as [attr, content] pairs, plus where `</head>` ends. */
function metas(html) {
  const decode = (s) =>
    s
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#x27;", "'")
      .replaceAll("&#39;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  const tags = [...html.matchAll(/<meta\s[^>]*>/g)].map((m) => ({ tag: m[0], index: m.index }));
  const attr = (tag, name) => {
    const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
    return m ? decode(m[1]) : null;
  };
  const headEnd = html.indexOf("</head>");
  return tags.map(({ tag, index }) => ({
    key: attr(tag, "property") ?? attr(tag, "name"),
    content: attr(tag, "content"),
    inHead: index < headEnd,
  }));
}
const WHATSAPP_UA = "WhatsApp/2.23.20.0 A";
async function fetchHtml(p) {
  const res = await fetch(BASE + p, { headers: { "User-Agent": WHATSAPP_UA, "Accept-Language": "tr" } });
  return { status: res.status, html: await res.text() };
}

async function signedOutScenario(width, height) {
  const label = `${width}px signed out`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await go(page, `/events/${RIDE.id}`);
    const tz = await teaser(page);
    check(`${label} ride: teaser shown`, tz !== null);
    if (!tz) return;
    check(`${label} ride: the card's heading is the title`, tz.title === RIDE.title, tz.title);
    check(`${label} ride: area line`, tz.text.includes(RIDE.area), tz.text);
    check(`${label} ride: kind badge`, tz.text.includes("Sürüş"), tz.text);
    check(`${label} ride: the card links nowhere`, tz.cardLinks === 0);
    const signInLink = tz.links.find(([text]) => text === "Giriş yap");
    const next = signInLink ? new URL(signInLink[1], BASE) : null;
    check(
      `${label} ride: "Giriş yap" returns to this event`,
      next?.pathname === "/sign-in" && next.searchParams.get("next") === `/events/${RIDE.id}`,
      JSON.stringify(tz.links),
    );
    check(
      `${label} ride: "Başvur" goes to /apply`,
      tz.links.some(([text, href]) => text === "Başvur" && href.startsWith("/apply")),
      JSON.stringify(tz.links),
    );
    const html = await page.content();
    for (const [what, value] of Object.entries(SECRET))
      check(`${label} ride: HTML holds no ${what}`, !html.includes(value));
    await page.screenshot({ path: path.join(DIR, `events-public-ride-${width}.png`), fullPage: true });

    await go(page, `/events/${MEETUP.id}`);
    const meetup = await teaser(page);
    check(`${label} meet-up: teaser with its title`, meetup?.title === MEETUP.title, meetup?.title);
    check(`${label} meet-up: kind badge`, meetup?.text.includes("Buluşma") ?? false, meetup?.text);
    check(`${label} meet-up: no area line`, meetup !== null && !meetup.allText.includes("Bölge:"), meetup?.allText);
    check(`${label} meet-up: HTML holds no place name`, !(await page.content()).includes(SECRET.place));

    await go(page, `/events/${CANCELLED.id}`);
    const cancelled = await teaser(page);
    check(`${label} cancelled: "İptal edildi"`, cancelled?.text.includes("İptal edildi") ?? false, cancelled?.text);
    check(`${label} cancelled: title struck through`, cancelled?.struck === true);
    check(`${label} cancelled: HTML holds no cancel reason`, !(await page.content()).includes("E2E gizli neden"));

    for (const p of ["/events/not-a-uuid", `/events/${UNKNOWN}`]) {
      await go(page, p);
      check(`${label} ${p} is a 404`, JSON.stringify(await h1s(page)) === '["Sayfa bulunamadı"]');
    }
  } finally {
    await ctx.close();
  }
}

async function pendingScenario(email, width, height) {
  const label = `${width}px ${email}`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await signIn(page, email, BASE);
    await go(page, `/events/${RIDE.id}`);
    const tz = await teaser(page);
    check(`${label}: teaser shown`, tz?.title === RIDE.title, tz?.title);
    if (!tz) return;
    check(
      `${label}: no "Giriş yap"`,
      !tz.links.some(([, href]) => href.includes("/sign-in")),
      JSON.stringify(tz.links),
    );
    if (email === "pending-noapp@test.local") {
      check(
        `${label}: "Başvur"`,
        tz.links.some(([text, href]) => text === "Başvur" && href.startsWith("/apply")),
      );
    } else {
      check(`${label}: "Başvurun inceleniyor"`, tz.text.includes("Başvurun inceleniyor"), tz.text);
      check(`${label}: no "Başvur"`, !tz.links.some(([, href]) => href.startsWith("/apply")), JSON.stringify(tz.links));
    }
    check(`${label}: HTML holds no place name`, !(await page.content()).includes(SECRET.place));
  } finally {
    await ctx.close();
  }
}

async function memberControl() {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  try {
    await signIn(page, "member@test.local", BASE);
    await go(page, `/events/${RIDE.id}`);
    const html = await page.content();
    check(
      "control: a member gets the full event page (place names, time)",
      html.includes(SECRET.place) && html.includes(SECRET.time),
    );
    check("control: a member gets no teaser", (await teaser(page)) === null);
  } finally {
    await ctx.close();
  }
}

async function metadataChecks() {
  const meta = (list, key) => list.find((m) => m.key === key);
  {
    const { status, html } = await fetchHtml(`/events/${RIDE.id}`);
    const m = metas(html);
    const day = dayText(RIDE.id, "tr");
    const description = meta(m, "og:description")?.content ?? "";
    check("meta ride: 200", status === 200, String(status));
    check(
      "meta ride: og:title is the title",
      meta(m, "og:title")?.content === RIDE.title,
      meta(m, "og:title")?.content,
    );
    check(
      "meta ride: og:description = kind · day · area",
      description === `Sürüş · ${day} · ${RIDE.area}`,
      `${description} (day ${day})`,
    );
    check("meta ride: description matches og:description", meta(m, "description")?.content === description);
    check("meta ride: og tags in <head> for WhatsApp", meta(m, "og:title")?.inHead === true);
    check(
      "meta ride: og:url is the event URL",
      meta(m, "og:url")?.content === `https://ridevibe.com.tr/events/${RIDE.id}`,
      meta(m, "og:url")?.content,
    );
    check("meta ride: og:locale tr_TR", meta(m, "og:locale")?.content === "tr_TR");
    check("meta ride: noindex", /noindex/.test(meta(m, "robots")?.content ?? ""), meta(m, "robots")?.content);
    check("meta ride: no start time anywhere in the head", !m.some((x) => (x.content ?? "").includes(SECRET.time)));
    check("meta ride: <title> has the event title", new RegExp(`<title>${RIDE.title}`).test(html));
  }
  {
    const { html } = await fetchHtml(`/en/events/${RIDE.id}`);
    const m = metas(html);
    const day = dayText(RIDE.id, "en");
    const description = meta(m, "og:description")?.content ?? "";
    check("meta /en ride: English description", description === `Ride · ${day} · ${RIDE.area}`, description);
    check(
      "meta /en ride: og:url under /en",
      meta(m, "og:url")?.content === `https://ridevibe.com.tr/en/events/${RIDE.id}`,
      meta(m, "og:url")?.content,
    );
    check("meta /en ride: og:locale en_US", meta(m, "og:locale")?.content === "en_US");
  }
  {
    const { html } = await fetchHtml(`/events/${MEETUP.id}`);
    const description = meta(metas(html), "og:description")?.content ?? "";
    check("meta meet-up: kind · day, no area", description === `Buluşma · ${dayText(MEETUP.id, "tr")}`, description);
  }
  {
    const { html } = await fetchHtml(`/events/${CANCELLED.id}`);
    const description = meta(metas(html), "og:description")?.content ?? "";
    check(
      'meta cancelled: "İptal edildi · " first',
      description === `İptal edildi · Sürüş · ${dayText(CANCELLED.id, "tr")} · ${CANCELLED.area}`,
      description,
    );
  }
  for (const p of [`/events/${UNKNOWN}`, "/events/not-a-uuid"]) {
    const { html } = await fetchHtml(p);
    const m = metas(html);
    check(
      `meta ${p}: generic (no event title, noindex)`,
      !html.includes("E2E Önizleme") && /noindex/.test(meta(m, "robots")?.content ?? ""),
    );
  }
}

try {
  plant();
  await memberControl();
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await signedOutScenario(width, height);
  }
  await pendingScenario("pending-noapp@test.local", 390, 844);
  if (hasPendingApp) await pendingScenario("pending-app@test.local", 390, 844);
  else console.log("SKIP pending-app@test.local (no linked application with status new/contacted)");
  await metadataChecks();
} catch (e) {
  fails++;
  console.log("FAIL unexpected error —", e.stack ?? e);
} finally {
  // Cleanup must not hide the real failure above.
  try {
    clean();
  } catch (e) {
    fails++;
    console.log("FAIL cleanup —", e.message);
  }
  await browser.close().catch(() => {});
}
console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
