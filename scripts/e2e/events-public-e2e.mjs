// Events for non-members: the `/events` teaser list, the per-event teaser page and its link-preview metadata (PASS/FAIL
// lines, exit code != 0 on failure). Needs a production server on :3123 (pnpm build && pnpm start -p 3123) and email
// sign-in enabled locally (docs/learnings/testing.md, "Testing as a signed-in user locally") with these fixtures:
//   admin@test.local         active, admin role (the organiser who expires the cached list, see below)
//   member@test.local        active, no role (the positive control: members still get the full list and event page)
//   pending-noapp@test.local pending, no application
//   pending-app@test.local   pending, one linked application with status `new` (optional: SKIP without it)
// Fixture recipe: the header of scripts/e2e/probation-e2e.mjs (pending users: keep status `pending`; link the
// application of pending-app via `applications.profile_id`, scripts/e2e/README.md).
// `/events` signed out (390px and 1280px; `/en/events` once): the heading "Etkinlikler", the intro, the total line, the
// planted upcoming rides in day order (a ride planted last but earliest comes first) as cards that link nowhere,
// "Kulübe Başvur" and "Giriş yap" (back to `/events`); the HTML holds no meet-up, cancelled or past ride, place name,
// start time, description or `/events/<id>` link. The pending users get the list and no "Giriş yap"; pending-app no
// "Kulübe Başvur".
// The member gets the 2a list (chips, card links, the meet-up and the cancelled ride: the positive controls). With
// no upcoming ride left: the empty state (SKIP when the DB holds other upcoming rides).
// Join-panel focus (the member, keyboard, on a planted ride): "−" down to 0 guests moves focus to "+", "+" up to 3 to
// "−"; "Katılıyorum", "Güncelle" and the leave dialog's confirm leave it on the panel heading, dismissing the dialog
// returns it to "Katılmaktan vazgeç". The member leaves again (and by psql in `finally` if a check broke off).
// Signed out, on a planted ride: the card (title, area, day; no link), "Giriş yap" (back to this event via `?next=`)
// and "Başvur"; the HTML holds no place name, start time or description. A meet-up shows no area line; a cancelled
// ride says "İptal edildi". A malformed id and an unknown uuid are the 404 page. The pending user gets the card and
// "Başvur" but no "Giriş yap"; pending-app reads "Başvurun inceleniyor" and no "Başvur". The page `<head>` (fetched
// as WhatsApp's crawler, which gets blocking metadata) has the event title as `og:title`, kind · day · area as
// `og:description` (English on `/en`), "İptal edildi · " first for a cancelled event, no start time, and noindex;
// `og:url` is the lowercased id even when the link has capitals. Link-preview image (`opengraph-image`): the page's
// `og:image` (and `twitter:image`) points to it; it answers 200 `image/png` 1200x630 for a ride, a meet-up, a cancelled
// ride, an 80-character title with Turkish capitals, `/en`, an unknown uuid and a malformed id (the last two: the
// generic club card). The PNGs go to OUT_DIR (`og-*.png`): look at them (layout, Turkish glyphs, two lines then an
// ellipsis, English text on `/en`).
// Home page (`/`, prerendered; signed out at 390px and 1280px, `/en` once): the "next rides" section lists the first 3
// upcoming rides (4 planted: the 4th stays off) soonest first as cards that link nowhere, no meet-up or cancelled ride,
// no place name, time, description or `/events/<id>` link, and "Tüm etkinlikler (4 sürüş)" to `/events`; the hero's
// `data-home-events` button "Etkinlikleri Gör" goes to `/events` and keeps the hero's cream text in the light theme
// too. Invalidation: admin@ cancels the first listed ride through the event page's cancel dialog, then a signed-out
// load of `/` lists the next three and "Tüm etkinlikler" without a count; with no upcoming ride the section is gone.
// Cached reads: the list (`getTeaserRides`) and the preview per event id (`getEventPreview`) are `"use cache"` reads
// tagged `events-public` (the home page's prerender carries the tag too), and rows planted by psql never expire that
// cache. So the script plants its rows (fixed ids, same content every run) and then expires the tag through the
// organiser UI: admin@ cancels a planted ride (FLUSH, set back to scheduled by psql first), and `cancelEvent` calls
// `updateTag`. It does that again after deleting the listed rides for the empty state. A running server is fine: no
// restart or rebuild needed.
// Fixture rows (events titled "E2E Önizleme …" with fixed ids) are planted and deleted through `docker exec psql`
// (DB_CONTAINER, local only) before and after the run. Env: PUPPETEER_DIR (required), OUT_DIR (screenshots), BASE_URL.
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
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

for (const who of ["admin", "member", "pending-noapp"]) {
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
// 80 characters (the maximum) with Turkish capitals and lowercase letters early, so they show before the ellipsis.
const LONG = {
  id: "00000000-0000-4000-8000-00000000e404",
  title: "İĞNEADA ŞİLE ÇÖĞÜŞ TURU: ığdır şüçö Kıyı Yolu, Ağva ve Ömerli Üzerinden Gün Boyu",
  area: "Şişli → İğneada, Gümüşçay",
};
// The `/events` list: a ride planted last but earliest (the order comes from the day), a past ride (never listed) and
// the ride the organiser cancels through the UI to expire the cached list (`expireTeaserList`).
const EARLY = { id: "00000000-0000-4000-8000-00000000e405", title: "E2E Önizleme Riva Sürüşü", area: "Beykoz → Riva" };
const PAST = { id: "00000000-0000-4000-8000-00000000e406", title: "E2E Önizleme Geçmiş Sürüş" };
const FLUSH = { id: "00000000-0000-4000-8000-00000000e407", title: "E2E Önizleme Önbellek Sürüşü" };
// The 4th upcoming ride: the home section shows only 3.
const LATE = {
  id: "00000000-0000-4000-8000-00000000e408",
  title: "E2E Önizleme Kilyos Sürüşü",
  area: "Sarıyer → Kilyos",
};
const LISTED = [EARLY, RIDE, LONG, LATE];
const EVENTS = [RIDE, MEETUP, CANCELLED, LONG, EARLY, PAST, FLUSH, LATE];
const ALL_IDS = EVENTS.map((e) => `'${e.id}'`).join(", ");
const UNKNOWN = "00000000-0000-4000-8000-00000000e4ff";
// Never in a public page: place names, the start time, the description.
const SECRET = { place: "E2E Gizli", time: "08:30", description: "E2E gizli açıklama" };

/** A start at `hh:mm` Istanbul time, `days` from today (Istanbul). */
const at = (days, hhmm) =>
  `(((now() at time zone 'Europe/Istanbul')::date + ${days}) + time '${hhmm}') at time zone 'Europe/Istanbul'`;

function clean() {
  sql(`delete from events where id in (${ALL_IDS})`);
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
  sql(
    `insert into events (id, kind, title, side, area, starts_at) values ('${LONG.id}', 'ride', '${LONG.title}', 'european', '${LONG.area}', ${at(8, "07:00")})`,
  );
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${LONG.id}', 0, '${SECRET.place} C', 41.0600, 28.9870), ('${LONG.id}', 1, '${SECRET.place} D', 41.8790, 27.9570)`,
  );
  sql(
    `insert into events (id, kind, title, side, area, starts_at) values ('${EARLY.id}', 'ride', '${EARLY.title}', 'asian', '${EARLY.area}', ${at(1, "09:00")})`,
  );
  sql(
    `insert into events (id, kind, title, side, area, starts_at) values ('${PAST.id}', 'ride', '${PAST.title}', 'asian', 'Kadıköy → Polonezköy', ${at(-2, "09:00")})`,
  );
  sql(
    `insert into events (id, kind, title, side, area, starts_at) values ('${FLUSH.id}', 'ride', '${FLUSH.title}', 'european', 'Şişli → Kilyos', ${at(30, "09:00")})`,
  );
  sql(
    `insert into events (id, kind, title, side, area, starts_at) values ('${LATE.id}', 'ride', '${LATE.title}', 'european', '${LATE.area}', ${at(12, "09:00")})`,
  );
}
/** Upcoming scheduled rides in the DB that this script did not plant (they would change the expected lists). */
const otherUpcomingRides = () =>
  sql(
    `select count(*) from events where kind = 'ride' and status = 'scheduled' and (starts_at at time zone 'Europe/Istanbul')::date >= (now() at time zone 'Europe/Istanbul')::date and id not in (${ALL_IDS})`,
  );
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
      "control: a member gets the full event page (place names, time, description)",
      html.includes(SECRET.place) && html.includes(SECRET.time) && html.includes(SECRET.description),
    );
    check("control: a member gets no teaser", (await teaser(page)) === null);
    await go(page, `/events/${CANCELLED.id}`);
    check("control: a member reads the cancel reason", (await page.content()).includes("E2E gizli neden"));
  } finally {
    await ctx.close();
  }
}

/** What has keyboard focus: a button's label or text, the join panel's heading, or the tag name. */
const focused = (page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "body";
    if (a.tagName === "H2") return `h2:${a.textContent.trim()}`;
    return a.getAttribute("aria-label") ?? `${a.tagName.toLowerCase()}:${a.textContent.trim()}`;
  });
/** Focuses the first visible element matching selector and text (regexp source); false when there is none. */
const focusOn = (page, selector, text = "") =>
  page.evaluate(
    (selector, text) => {
      const el = [...document.querySelectorAll(selector)].find(
        (e) => e.getBoundingClientRect().width > 0 && new RegExp(text).test(e.textContent),
      );
      el?.scrollIntoView({ block: "center" });
      el?.focus();
      return el !== undefined;
    },
    selector,
    text,
  );
const shiftTab = async (page) => {
  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");
};

/**
 * The join panel keeps keyboard focus when the focused control disables or unmounts (follow-ups "Events joining UI
 * minors" (a)): "−" down to 0 guests → "+"; "+" up to 3 → "−"; "Katılıyorum", "Güncelle" (disabled while saving, then
 * unchanged) and confirming "Katılmaktan vazgeç" → the panel heading; dismissing that dialog → back to its trigger.
 * The member leaves again at the end.
 */
async function joinFocusScenario() {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  const fewer = "Bir misafir çıkar";
  const more = "Bir misafir ekle";
  try {
    await signIn(page, "member@test.local", BASE);
    await go(page, `/events/${RIDE.id}`);
    check("focus: the more-guests button exists", await focusOn(page, `button[aria-label="${more}"]`));
    await page.keyboard.press("Enter"); // 1 guest
    await shiftTab(page);
    check('focus: Shift+Tab from "+" reaches "−"', (await focused(page)) === fewer, await focused(page));
    await page.keyboard.press("Enter"); // 0 guests: "−" disables
    await sleep(300);
    check('focus: "−" down to 0 guests moves focus to "+"', (await focused(page)) === more, await focused(page));
    for (let i = 0; i < 3; i++) await page.keyboard.press("Enter"); // 3 guests: "+" disables
    await sleep(300);
    check('focus: "+" up to 3 guests moves focus to "−"', (await focused(page)) === fewer, await focused(page));
    for (let i = 0; i < 3; i++) await page.keyboard.press("Enter"); // back to 0
    await sleep(300);
    check('focus: focus on "+" again at 0 guests', (await focused(page)) === more, await focused(page));

    await focusOn(page, "button", "^Katılıyorum$");
    await page.keyboard.press("Enter");
    const joined = await until(page, () =>
      [...document.querySelectorAll("h2")].some((h) => h.textContent.trim() === "Katılıyorsun"),
    );
    check("focus: joined", joined !== null);
    await sleep(300);
    check(
      '"Katılıyorum" (unmounted after joining) leaves focus on the panel heading',
      (await focused(page)) === "h2:Katılıyorsun",
      await focused(page),
    );

    await focusOn(page, `button[aria-label="${more}"]`);
    await page.keyboard.press("Enter"); // 1 guest: "Güncelle" enables
    await focusOn(page, "button", "^Güncelle$");
    await page.keyboard.press("Enter");
    const updated = await until(page, () => document.body.innerText.includes("Katılımın güncellendi."));
    check("focus: updated", updated !== null);
    await sleep(300);
    check(
      '"Güncelle" (disabled once saved) leaves focus on the panel heading',
      (await focused(page)) === "h2:Katılıyorsun",
      await focused(page),
    );

    await focusOn(page, "button", "^Katılmaktan vazgeç$");
    await page.keyboard.press("Enter");
    await until(page, () => document.querySelector('[role="alertdialog"]') !== null);
    await sleep(400);
    await page.keyboard.press("Escape");
    await sleep(600);
    check(
      "dismissing the leave dialog returns focus to its trigger",
      (await focused(page)) === "button:Katılmaktan vazgeç",
      await focused(page),
    );
    await page.keyboard.press("Enter");
    const dialog = await until(page, () => document.querySelector('[role="alertdialog"]') !== null);
    check("focus: the leave dialog opens", dialog !== null);
    await sleep(400);
    await focusOn(page, '[role="alertdialog"] button', "^Evet, vazgeç$");
    await page.keyboard.press("Enter");
    const left = await until(page, () =>
      [...document.querySelectorAll("h2")].some((h) => h.textContent.trim() === "Katılıyor musun?"),
    );
    check("focus: left", left !== null);
    await sleep(600); // the dialog's closing animation, then its final focus
    check(
      "leaving through the dialog leaves focus on the panel heading",
      (await focused(page)) === "h2:Katılıyor musun?",
      await focused(page),
    );
  } finally {
    // A check that failed midway may leave the member joined: leave by psql (sign-ups are no public data, so the
    // cached public reads need no expiry).
    sql(
      `delete from event_signups where event_id = '${RIDE.id}' and profile_id = (select id from auth.users where email = 'member@test.local')`,
    );
    await ctx.close();
  }
}

async function until(page, fn, arg, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    await sleep(100);
  }
  return null;
}
/** Clicks the first visible element matching selector and text (regexp source); false when there is none. */
async function click(page, selector, text) {
  const handle = await page.evaluateHandle(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find(
        (e) => e.getBoundingClientRect().width > 0 && new RegExp(text).test(e.textContent),
      ) ?? null,
    selector,
    text,
  );
  const el = handle.asElement();
  if (!el) return false;
  await el.evaluate((b) => b.scrollIntoView({ block: "center" })); // the fixed tab bar would eat the click
  await el.click();
  return true;
}

/** Sets a planted event back to scheduled (psql: does not expire the cached reads). */
const reschedule = (event) =>
  sql(`update events set status = 'scheduled', cancelled_at = null, cancel_reason = null where id = '${event.id}'`);

/** The organiser (admin@) cancels a scheduled event through its page's cancel dialog (`cancelEvent` → `updateTag`). */
async function cancelThroughUi(event) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width: 1280, height: 900 });
  try {
    await signIn(page, "admin@test.local", BASE);
    await go(page, `/events/${event.id}`);
    if (!(await click(page, "button", "Etkinliği iptal et"))) throw new Error('organiser: no "Etkinliği iptal et"');
    if (!(await until(page, () => !!document.querySelector("[role=alertdialog] textarea"))))
      throw new Error("organiser: no cancel dialog");
    await click(page, "[role=alertdialog] button", "^\\s*İptal et\\s*$");
    for (let i = 0; i < 100 && sql(`select status from events where id = '${event.id}'`) !== "cancelled"; i++)
      await sleep(100);
    if (sql(`select status from events where id = '${event.id}'`) !== "cancelled")
      throw new Error(`organiser: "${event.title}" was not cancelled`);
    await sleep(300); // the action's response (and its updateTag) has landed
  } finally {
    await ctx.close();
  }
}

/**
 * Expires the cached public reads (tag `events-public`) the way production does: the organiser cancels FLUSH through
 * the UI. FLUSH is set back to scheduled by psql first, so this works every time.
 */
async function expireTeaserList() {
  reschedule(FLUSH);
  await cancelThroughUi(FLUSH);
}

/** The visible `/events` teaser: heading, intro, total line, card titles, links. Null when not shown. */
const eventsTeaser = (page) =>
  page.evaluate(() => {
    const visible = (e) => e.getBoundingClientRect().width > 0;
    const root = [...document.querySelectorAll("[data-skeleton-result=events-teaser]")].find(visible);
    if (!root) return null;
    return {
      h1: [...root.querySelectorAll("h1")].map((h) => h.textContent.trim()),
      intro: root.querySelector("[data-skeleton-result=events-teaser-intro] p")?.textContent.trim() ?? "",
      total: root.querySelector("[data-skeleton-result=events-teaser-total]")?.textContent.trim() ?? null,
      titles: [...root.querySelectorAll("article h2")].map((h) => h.textContent.trim()),
      text: root.innerText,
      links: [...root.querySelectorAll("a")].filter(visible).map((a) => [a.textContent.trim(), a.getAttribute("href")]),
      cardLinks: root.querySelectorAll("article a").length,
    };
  });
/** Links to an event page (`/events/<uuid>`) anywhere in the HTML (markup and RSC payload). */
const eventLinks = (html) => html.match(/\/events\/[0-9a-f]{8}-[0-9a-f]{4}-/gi) ?? [];
/** The planted titles among the listed ones (the DB may hold other rides). */
const PLANTED = (titles) => titles.filter((t) => EVENTS.some((e) => e.title === t));

async function listSignedOutScenario(width, height) {
  const label = `${width}px signed out /events`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await go(page, "/events");
    const list = await eventsTeaser(page);
    check(`${label}: teaser shown`, list !== null);
    if (!list) return;
    check(`${label}: heading "Etkinlikler"`, JSON.stringify(list.h1) === '["Etkinlikler"]', JSON.stringify(list.h1));
    check(`${label}: intro about the weekend rides`, list.intro.includes("hafta sonu"), list.intro);
    check(`${label}: total line`, /^\d+ yaklaşan sürüş$/.test(list.total ?? ""), list.total);
    check(
      `${label}: planted rides in day order`,
      JSON.stringify(PLANTED(list.titles)) === JSON.stringify(LISTED.map((e) => e.title)),
      JSON.stringify(list.titles),
    );
    check(`${label}: area line`, list.text.includes(RIDE.area), list.text);
    check(`${label}: cards link nowhere`, list.cardLinks === 0);
    const signInLink = list.links.find(([text]) => text === "Giriş yap");
    const next = signInLink ? new URL(signInLink[1], BASE) : null;
    check(
      `${label}: "Giriş yap" returns to /events`,
      next?.pathname === "/sign-in" && next.searchParams.get("next") === "/events",
      JSON.stringify(list.links),
    );
    check(
      `${label}: "Kulübe Başvur" goes to /apply`,
      list.links.some(([text, href]) => text === "Kulübe Başvur" && href.startsWith("/apply")),
      JSON.stringify(list.links),
    );
    const html = await page.content();
    for (const [what, title] of [
      ["meet-up", MEETUP.title],
      ["cancelled ride", CANCELLED.title],
      ["past ride", PAST.title],
      ["cancelled FLUSH ride", FLUSH.title],
    ])
      check(`${label}: HTML holds no ${what}`, !html.includes(title));
    for (const [what, value] of Object.entries(SECRET)) check(`${label}: HTML holds no ${what}`, !html.includes(value));
    check(`${label}: HTML holds no /events/<id> link`, eventLinks(html).length === 0, eventLinks(html).join(" "));
    await page.screenshot({ path: path.join(DIR, `events-public-list-${width}.png`), fullPage: true });

    if (width === 1280) {
      await go(page, "/en/events");
      const en = await eventsTeaser(page);
      check('/en/events signed out: heading "Events"', JSON.stringify(en?.h1) === '["Events"]', JSON.stringify(en?.h1));
      check("/en/events signed out: English total line", /^\d+ upcoming rides?$/.test(en?.total ?? ""), en?.total);
      const enSignIn = en?.links.find(([text]) => text === "Sign in");
      const enNext = enSignIn ? new URL(enSignIn[1], BASE) : null;
      check(
        '/en/events signed out: "Sign in" returns to /en/events',
        enNext?.pathname === "/en/sign-in" && enNext.searchParams.get("next") === "/en/events",
        JSON.stringify(en?.links),
      );
    }
  } finally {
    await ctx.close();
  }
}

async function listPendingScenario(email) {
  const label = `390px ${email} /events`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  try {
    await signIn(page, email, BASE);
    await go(page, "/events");
    const list = await eventsTeaser(page);
    check(
      `${label}: teaser with the planted rides`,
      JSON.stringify(PLANTED(list?.titles ?? [])) === JSON.stringify(LISTED.map((e) => e.title)),
      JSON.stringify(list?.titles),
    );
    if (!list) return;
    check(
      `${label}: no "Giriş yap"`,
      !list.links.some(([, href]) => href.includes("/sign-in")),
      JSON.stringify(list.links),
    );
    const apply = list.links.some(([text, href]) => text === "Kulübe Başvur" && href.startsWith("/apply"));
    if (email === "pending-noapp@test.local") check(`${label}: "Kulübe Başvur"`, apply, JSON.stringify(list.links));
    else check(`${label}: no "Kulübe Başvur" (application under review)`, !apply, JSON.stringify(list.links));
    check(`${label}: HTML holds no /events/<id> link`, eventLinks(await page.content()).length === 0);
  } finally {
    await ctx.close();
  }
}

async function listMemberControl() {
  const label = "control: member /events";
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  try {
    await signIn(page, "member@test.local", BASE);
    await go(page, "/events");
    check(`${label} gets no teaser`, (await eventsTeaser(page)) === null);
    const chips = await page.evaluate(
      () =>
        [...document.querySelectorAll("[data-skeleton-result=events-chips]")].filter(
          (e) => e.getBoundingClientRect().width > 0,
        ).length,
    );
    check(`${label} gets the 2a list (filter chips)`, chips === 1, String(chips));
    const html = await page.content();
    check(`${label}: links to the event pages`, html.includes(`/events/${RIDE.id}`) && eventLinks(html).length > 0);
    check(
      `${label}: the meet-up and the cancelled ride`,
      html.includes(MEETUP.title) && html.includes(CANCELLED.title),
    );
    check(`${label}: start times`, html.includes(SECRET.time));
    await go(page, "/events/past");
    check("control: member /events/past lists the past ride", (await page.content()).includes(PAST.title));
  } finally {
    await ctx.close();
  }
}

/** The visible home "next rides" section: heading, card titles, links, text. Null when not shown. */
const homeRides = (page) =>
  page.evaluate(() => {
    const visible = (e) => e.getBoundingClientRect().width > 0;
    const root = [...document.querySelectorAll("[data-home-next-rides]")].find(visible);
    if (!root) return null;
    return {
      h2: [...root.querySelectorAll("h2")].map((h) => h.textContent.trim()),
      titles: [...root.querySelectorAll("article h3")].map((h) => h.textContent.trim()),
      text: root.innerText,
      links: [...root.querySelectorAll("a")].filter(visible).map((a) => [a.textContent.trim(), a.getAttribute("href")]),
      cardLinks: root.querySelectorAll("article a").length,
    };
  });
/** The hero's visible "Etkinlikleri Gör" button: text, href, and its text colour next to the hero heading's. */
const heroEvents = (page) =>
  page.evaluate(() => {
    const visible = (e) => e.getBoundingClientRect().width > 0;
    const hero = [...document.querySelectorAll("main [data-home-hero]")].find(visible);
    const a = hero && [...hero.querySelectorAll("a[data-home-events]")].find(visible);
    if (!a) return null;
    return {
      text: a.textContent.trim(),
      href: a.getAttribute("href"),
      color: getComputedStyle(a).color,
      headingColor: getComputedStyle(hero.querySelector("h1")).color,
    };
  });

async function homeScenario(width, height) {
  const label = `${width}px signed out /`;
  const exact = otherUpcomingRides() === "0";
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await go(page, "/");
    const home = await homeRides(page);
    check(`${label}: next rides section shown`, home !== null);
    if (home) {
      check(`${label}: one section heading`, home.h2.length === 1 && home.h2[0].length > 0, JSON.stringify(home.h2));
      check(`${label}: at most 3 rides`, home.titles.length === 3, JSON.stringify(home.titles));
      if (exact)
        check(
          `${label}: the first 3 planted rides, soonest first`,
          JSON.stringify(home.titles) === JSON.stringify(LISTED.slice(0, 3).map((e) => e.title)),
          JSON.stringify(home.titles),
        );
      else console.log("SKIP exact home list (other upcoming rides in the DB)");
      check(`${label}: area line`, home.text.includes(EARLY.area), home.text);
      check(`${label}: cards link nowhere`, home.cardLinks === 0);
      const all = home.links.find(([, href]) => href === "/events");
      check(
        `${label}: "Tüm etkinlikler" with the total, to /events`,
        exact ? all?.[0] === "Tüm etkinlikler (4 sürüş)" : /^Tüm etkinlikler/.test(all?.[0] ?? ""),
        JSON.stringify(home.links),
      );
      check(`${label}: no other link in the section`, home.links.length === 1, JSON.stringify(home.links));
    }
    const html = await page.content();
    for (const [what, title] of [
      ["meet-up", MEETUP.title],
      ["cancelled ride", CANCELLED.title],
      ["past ride", PAST.title],
      ["cancelled FLUSH ride", FLUSH.title],
    ])
      check(`${label}: HTML holds no ${what}`, !html.includes(title));
    if (exact) check(`${label}: HTML holds no 4th ride`, !html.includes(LATE.title));
    for (const [what, value] of Object.entries(SECRET)) check(`${label}: HTML holds no ${what}`, !html.includes(value));
    check(`${label}: HTML holds no /events/<id> link`, eventLinks(html).length === 0, eventLinks(html).join(" "));

    const hero = await heroEvents(page);
    check(
      `${label}: hero "Etkinlikleri Gör" to /events`,
      hero?.text === "Etkinlikleri Gör" && hero.href === "/events",
      JSON.stringify(hero),
    );
    check(
      `${label}: hero button text is the hero's cream (dark theme)`,
      hero !== null && hero.color === hero.headingColor,
      JSON.stringify(hero),
    );
    await page.screenshot({ path: path.join(DIR, `home-hero-${width}.png`) });
    const section = await page.$("[data-home-next-rides]");
    if (section) await section.screenshot({ path: path.join(DIR, `home-next-rides-${width}.png`) });

    // Light theme: the hero stays in the night palette (`dark` class), so the button keeps the cream text.
    await page.evaluate(() => localStorage.setItem("theme", "light"));
    await go(page, "/");
    const light = await heroEvents(page);
    const isLight = await page.evaluate(() => !document.documentElement.classList.contains("dark"));
    check(
      `${label}: light theme: hero button text stays cream`,
      isLight && light !== null && light.color === light.headingColor,
      JSON.stringify(light),
    );
    await page.screenshot({ path: path.join(DIR, `home-hero-light-${width}.png`) });
    if (section) {
      const lightSection = await page.$("[data-home-next-rides]");
      await lightSection?.screenshot({ path: path.join(DIR, `home-next-rides-light-${width}.png`) });
    }

    if (width === 1280) {
      await page.evaluate(() => localStorage.removeItem("theme"));
      await go(page, "/en");
      const en = await homeRides(page);
      const enAll = en?.links.find(([, href]) => href === "/en/events");
      check(
        '/en signed out: "All events" with the total, to /en/events',
        exact ? enAll?.[0] === "All events (4 rides)" : /^All events/.test(enAll?.[0] ?? ""),
        JSON.stringify(en?.links),
      );
      const enHero = await heroEvents(page);
      check(
        '/en signed out: hero "See events" to /en/events',
        enHero?.text === "See events" && enHero.href === "/en/events",
        JSON.stringify(enHero),
      );
    }
  } finally {
    await ctx.close();
  }
}

/** The organiser cancels the first listed ride through the UI; a signed-out load of `/` then drops it. */
async function homeInvalidationScenario() {
  const label = "390px signed out /, after the organiser cancels the first ride";
  if (otherUpcomingRides() !== "0") {
    console.log("SKIP home invalidation (other upcoming rides in the DB)");
    return;
  }
  await cancelThroughUi(EARLY);
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  try {
    await go(page, "/");
    const home = await homeRides(page);
    check(
      `${label}: the next three rides`,
      JSON.stringify(home?.titles) === JSON.stringify([RIDE, LONG, LATE].map((e) => e.title)),
      JSON.stringify(home?.titles),
    );
    check(`${label}: HTML holds no cancelled ride`, !(await page.content()).includes(EARLY.title));
    check(
      `${label}: "Tüm etkinlikler" without a count`,
      home?.links.some(([text, href]) => text === "Tüm etkinlikler" && href === "/events") ?? false,
      JSON.stringify(home?.links),
    );
  } finally {
    await ctx.close();
    reschedule(EARLY);
  }
}

async function listEmptyScenario() {
  const others = otherUpcomingRides();
  if (others !== "0") {
    console.log(`SKIP /events empty state (${others} other upcoming rides in the DB)`);
    return;
  }
  sql(`delete from events where id in (${LISTED.map((e) => `'${e.id}'`).join(", ")})`);
  await expireTeaserList();
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  try {
    await go(page, "/events");
    const list = await eventsTeaser(page);
    check("390px signed out /events, no rides: teaser shown", list !== null);
    if (!list) return;
    check("390px signed out /events, no rides: no cards", list.titles.length === 0, JSON.stringify(list.titles));
    check("390px signed out /events, no rides: empty state", list.text.includes("planlanmış bir sürüş yok"), list.text);
    check("390px signed out /events, no rides: no total line", list.total === null, list.total);
    check(
      '390px signed out /events, no rides: "Kulübe Başvur" and "Giriş yap" stay',
      list.links.some(([text]) => text === "Kulübe Başvur") && list.links.some(([text]) => text === "Giriş yap"),
      JSON.stringify(list.links),
    );
    await page.screenshot({ path: path.join(DIR, "events-public-list-empty-390.png"), fullPage: true });
    await go(page, "/");
    check("390px signed out /, no rides: no next rides section", (await homeRides(page)) === null);
    check('390px signed out /, no rides: hero "Etkinlikleri Gör" stays', (await heroEvents(page))?.href === "/events");
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
  {
    const { html } = await fetchHtml(`/events/${RIDE.id.toUpperCase()}`);
    check(
      "meta capitals in the link: og:url has the lowercased id",
      meta(metas(html), "og:url")?.content === `https://ridevibe.com.tr/events/${RIDE.id}`,
      meta(metas(html), "og:url")?.content,
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

/** Width and height from a PNG's IHDR chunk; null when the bytes are not a PNG. */
function pngSize(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((b, i) => bytes[i] !== b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

async function imageChecks() {
  const { html } = await fetchHtml(`/events/${RIDE.id}`);
  const m = metas(html);
  const image = m.find((x) => x.key === "og:image")?.content ?? "";
  const imageUrl = image ? new URL(image) : null;
  check(
    "image: the page's og:image is this event's opengraph-image",
    imageUrl?.origin === "https://ridevibe.com.tr" && imageUrl.pathname === `/events/${RIDE.id}/opengraph-image`,
    image,
  );
  check("image: og:image in <head> for WhatsApp", m.find((x) => x.key === "og:image")?.inHead === true);
  check(
    "image: twitter:image is the same image (large card)",
    m.find((x) => x.key === "twitter:image")?.content === image &&
      m.find((x) => x.key === "twitter:card")?.content === "summary_large_image",
    m.find((x) => x.key === "twitter:image")?.content,
  );
  check(
    "image: og:image:width/height 1200x630, type image/png",
    m.find((x) => x.key === "og:image:width")?.content === "1200" &&
      m.find((x) => x.key === "og:image:height")?.content === "630" &&
      m.find((x) => x.key === "og:image:type")?.content === "image/png",
  );
  {
    const en = metas((await fetchHtml(`/en/events/${RIDE.id}`)).html).find((x) => x.key === "og:image")?.content;
    check("image /en: og:image under /en", en === `https://ridevibe.com.tr/en/events/${RIDE.id}/opengraph-image`, en);
  }
  const query = imageUrl?.search ?? "";
  const cases = [
    ["ride", `/events/${RIDE.id}/opengraph-image${query}`],
    ["meetup", `/events/${MEETUP.id}/opengraph-image`],
    ["cancelled", `/events/${CANCELLED.id}/opengraph-image`],
    ["long-title", `/events/${LONG.id}/opengraph-image`],
    ["en-ride", `/en/events/${RIDE.id}/opengraph-image`],
    ["en-cancelled", `/en/events/${CANCELLED.id}/opengraph-image`],
    ["unknown", `/events/${UNKNOWN}/opengraph-image`],
    ["malformed", "/events/not-a-uuid/opengraph-image"],
  ];
  for (const [name, p] of cases) {
    const res = await fetch(BASE + p, { headers: { "User-Agent": WHATSAPP_UA } });
    const bytes = new Uint8Array(await res.arrayBuffer());
    const size = pngSize(bytes);
    check(
      `image ${name}: 200 image/png 1200x630`,
      res.status === 200 &&
        res.headers.get("content-type") === "image/png" &&
        size?.width === 1200 &&
        size.height === 630,
      `${res.status} ${res.headers.get("content-type")} ${JSON.stringify(size)} ${bytes.length} B, cache-control: ${res.headers.get("cache-control")}`,
    );
    if (res.status === 200) await writeFile(path.join(DIR, `og-${name}.png`), bytes);
  }
}

try {
  plant();
  await expireTeaserList();
  await listMemberControl();
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await listSignedOutScenario(width, height);
  }
  await listPendingScenario("pending-noapp@test.local");
  if (hasPendingApp) await listPendingScenario("pending-app@test.local");
  await memberControl();
  await joinFocusScenario();
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await signedOutScenario(width, height);
  }
  await pendingScenario("pending-noapp@test.local", 390, 844);
  if (hasPendingApp) await pendingScenario("pending-app@test.local", 390, 844);
  else console.log("SKIP pending-app@test.local (no linked application with status new/contacted)");
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await homeScenario(width, height);
  }
  await metadataChecks();
  await imageChecks();
  // After the rest: it cancels EARLY (set back to scheduled by psql, which the cached reads don't see).
  await homeInvalidationScenario();
  // Last: it deletes the listed rides.
  await listEmptyScenario();
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
