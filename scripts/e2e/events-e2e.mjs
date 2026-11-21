// Events, organiser side, behind the release gate (PASS/FAIL lines, exit code != 0 on failure; 390px and 1280px).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123) and email sign-in enabled locally
// (docs/learnings/testing.md, "Testing as a signed-in user locally") with these fixtures:
//   admin@test.local      active, admin role (every permission: the organiser)
//   member@test.local     active, no role
//   probation@test.local  status probation (the script gives it a role holding events.manage, then removes it)
// Fixture recipe: the header of scripts/e2e/probation-e2e.mjs (the same three users).
// As the organiser it creates a ride per viewport whose start is typed coordinates, whose stop is a pasted long Google
// place link (venue only) and whose finish is a pasted long Google route link with the Kız Kulesi origin (long links:
// no network), checks the paste box is emptied and the origin is in neither the page nor any column of
// `events`/`event_places`, the list with side/kind chips (no server request), the map-app links of all three places
// (Yandex longitude first in `pt=`, no Navi for the venue-only stop), the WhatsApp share link (`text=` with title and route but no event link, no `phone=`),
// an edit of the start time (stored UTC = Istanbul wall time − 3 h), cancel with a reason (banner, struck card) and
// delete; `/events/past` pages over planted past events (> 25). The member and the probation organiser get "Çok
// yakında" on `/events` and a 404 on `/events/{id}`, `/events/new` and `/events/past`.
// Fixture rows (events titled "E2E …", the role "E2E Organizatör") are planted and deleted through `docker exec psql`
// (DB_CONTAINER, local only) before and after the run. Env: PUPPETEER_DIR (required), OUT_DIR (screenshots), BASE_URL.
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launch, newPage, pagerFit, signIn, watchServer } from "./e2e-lib.mjs";

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

const ID = Object.fromEntries(
  ["admin", "member", "probation"].map((n) => [n, sql(`select id from auth.users where email = '${n}@test.local'`)]),
);
for (const [who, id] of Object.entries(ID)) {
  if (!id) {
    console.log(`FAIL fixture ${who}@test.local is missing (recipe in the header of probation-e2e.mjs)`);
    process.exit(1);
  }
}

// Inputs (public places only; the route origin is Kız Kulesi, never a real person's position).
const START_TEXT = "41.0255, 29.0154";
const STARBUCKS_PATH = "Starbucks,+Cafera%C4%9Fa,+Muvakk%C4%B1thane+Cd.+No:9,+34710+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul";
const STARBUCKS_ID = "0x14cab93c1a414691:0x31f407649c1b19e0";
const PLACE_URL = `https://www.google.com/maps/place/${STARBUCKS_PATH}/data=!4m2!3m1!1s${STARBUCKS_ID}!18m1!1e1?g_ep=abc&entry=tts`;
const VENUE_URL = `https://www.google.com/maps/place/${STARBUCKS_PATH}/data=!4m2!3m1!1s${STARBUCKS_ID}`;
const VENUE_LABEL = "Starbucks, Caferağa, Muvakkıthane Cd. No:9, 34710 Kadıköy/İstanbul";
const ORIGIN = ["41.021111", "29.004167"];
const ROUTE_URL =
  "https://www.google.com/maps/dir/41.021111,29.004167/%C4%B0BB+Pa%C5%9Faliman%C4%B1+Sosyal+Tesisi/data=!4m8!4m7!1m1!4e1!1m3!2m2!1d29.0!2d41.0!3e0!3d41.0322013!4d29.0229043!5m1!1e1";
const NAMES = { start: "E2E Başlangıç", stop: "Starbucks Moda", finish: "Paşalimanı" };

// Planted rows: an upcoming meet-up on the European side (filters, gate checks) and past meet-ups (paging).
const MEETUP_ID = "00000000-0000-4000-8000-00000000e2e1";
const MEETUP_TITLE = "E2E Buluşma Avrupa";
const PAST_COUNT = 27;
const ROLE = "E2E Organizatör";

function clean() {
  sql("delete from events where title like 'E2E %'");
  sql(
    `update profiles set role_id = null where id = '${ID.probation}' and role_id in (select id from roles where name = '${ROLE}')`,
  );
  sql(`delete from roles where name = '${ROLE}'`);
}
function plant() {
  clean();
  sql(
    `insert into events (id, kind, title, side, starts_at) values ('${MEETUP_ID}', 'meetup', '${MEETUP_TITLE}', 'european', now() + interval '3 days')`,
  );
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${MEETUP_ID}', 0, 'E2E Karaköy', 41.0225, 28.9770)`,
  );
  sql(
    `insert into events (kind, title, side, starts_at) select 'meetup', format('E2E Geçmiş %s', lpad(g::text, 2, '0')), 'asian', now() - make_interval(days => g) from generate_series(1, ${PAST_COUNT}) g`,
  );
  sql(
    "insert into event_places (event_id, position, name, lat, lng) select id, 0, 'E2E Moda', 41.0255, 29.0154 from events where title like 'E2E Geçmiş %'",
  );
  // The probation organiser: a role holding events.manage (rights need an active member, so it must change nothing).
  const role = sql(`insert into roles (name) values ('${ROLE}') returning id`).split("\n")[0];
  sql(`insert into role_permissions (role_id, permission) values ('${role}', 'events.manage')`);
  sql(`update profiles set role_id = '${role}' where id = '${ID.probation}'`);
}

const browser = await launch();
const bodyText = (page) => page.evaluate(() => document.body.innerText);
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
const hasText = (page, text) => until(page, (t) => document.body.innerText.includes(t), text, 8000);
/** First visible element matching selector (and text regexp source), as a handle. */
async function find(page, selector, text = "") {
  const h = await page.evaluateHandle(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find(
        (e) => e.getBoundingClientRect().width > 0 && (!text || new RegExp(text).test(e.textContent)),
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
/** Sets a React-controlled input through the native setter (also `datetime-local`, whose typing is locale-bound). */
const setValue = (page, selector, value) =>
  page.evaluate(
    (selector, value) => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    },
    selector,
    value,
  );
/** A real paste event with `text` on the clipboard (the form reads the paste on the server at once). */
const paste = (page, selector, text) =>
  page.evaluate(
    (selector, text) => {
      const el = [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0);
      if (!el) return false;
      el.scrollIntoView({ block: "center" });
      el.focus();
      const data = new DataTransfer();
      data.setData("text/plain", text);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      return true;
    },
    selector,
    text,
  );
const inputValue = (page, selector) =>
  page.evaluate(
    (selector) =>
      [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0)?.value ?? null,
    selector,
  );
/** Visible event cards (title, struck through?, badges). */
const cards = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("a[data-skeleton-result=events-row]")]
      .filter((a) => a.getBoundingClientRect().width > 0)
      .map((a) => {
        const h2 = a.querySelector("h2");
        return {
          title: h2?.textContent ?? "",
          struck: h2 ? getComputedStyle(h2).textDecorationLine.includes("line-through") : false,
          text: a.innerText,
          href: a.getAttribute("href"),
        };
      }),
  );
const titles = async (page) => (await cards(page)).map((c) => c.title);
/** Opens a place's menu ("Konumu aç" / "Yol tarifi"), returns its items as [label, href] and closes it again. */
async function menuLinks(page, placeIndex, trigger) {
  const opened = await page.evaluate(
    (i, trigger) => {
      const li = [...document.querySelectorAll("[data-skeleton-result=event-places] ol > li")].filter(
        (e) => e.getBoundingClientRect().width > 0,
      )[i];
      const button = li && [...li.querySelectorAll("button")].find((b) => b.textContent.includes(trigger));
      if (!button) return false;
      button.scrollIntoView({ block: "center" });
      button.click();
      return true;
    },
    placeIndex,
    trigger,
  );
  if (!opened) return null;
  const links = await until(page, () => {
    const items = [...document.querySelectorAll("a[data-slot=dropdown-menu-link-item]")].filter(
      (a) => a.getBoundingClientRect().width > 0,
    );
    return items.length ? items.map((a) => [a.textContent.trim(), a.getAttribute("href")]) : null;
  });
  await page.keyboard.press("Escape");
  await until(
    page,
    () =>
      ![...document.querySelectorAll("a[data-slot=dropdown-menu-link-item]")].some(
        (a) => a.getBoundingClientRect().width > 0,
      ),
  );
  return links;
}
const shareHref = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("a")]
        .find((a) => a.getBoundingClientRect().width > 0 && a.textContent.includes("WhatsApp'ta paylaş"))
        ?.getAttribute("href") ?? null,
  );
/** Every column of the event and its places, as text. */
const storedText = (id) =>
  sql(`select row_to_json(e)::text from events e where id = '${id}'`) +
  "\n" +
  sql(`select row_to_json(p)::text from event_places p where event_id = '${id}' order by position`);
const eventIdFromUrl = (url) =>
  /\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(new URL(url).pathname)?.[1] ?? null;

/** "YYYY-MM-DD" in Istanbul (UTC+3, no DST), `days` from now. */
const istanbulDate = (days) => new Date(Date.now() + days * 864e5 + 3 * 36e5).toISOString().slice(0, 10);

const point = (lat, lng, name) => ({
  open: [
    ["Google Haritalar", `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`],
    ["Apple Haritalar", `https://maps.apple.com/?ll=${lat},${lng}&q=${encodeURIComponent(name)}`],
    ["Yandex Haritalar", `https://yandex.com.tr/maps/?pt=${lng},${lat}&z=16&l=map`],
  ],
  route: [
    ["Google Haritalar", `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`],
    ["Apple Haritalar", `https://maps.apple.com/?daddr=${lat},${lng}`],
    ["Yandex Haritalar", `https://yandex.com.tr/maps/?rtext=~${lat},${lng}&rtt=auto`],
    ["Yandex Navigasyon", `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`],
  ],
});
const q = encodeURIComponent(VENUE_LABEL);
const EXPECTED_LINKS = [
  ["start (typed coordinates)", point("41.025500", "29.015400", NAMES.start)],
  [
    "stop (venue only)",
    {
      open: [
        ["Google Haritalar", VENUE_URL],
        ["Apple Haritalar", `https://maps.apple.com/?q=${q}`],
        ["Yandex Haritalar", `https://yandex.com.tr/maps/?text=${q}`],
      ],
      route: [
        ["Google Haritalar", `https://www.google.com/maps/dir/?api=1&destination=${q}`],
        ["Apple Haritalar", `https://maps.apple.com/?daddr=${q}`],
        ["Yandex Haritalar", `https://yandex.com.tr/maps/?text=${q}`],
      ],
    },
  ],
  ["finish (route destination)", point("41.032201", "29.022904", NAMES.finish)],
];

async function organiserScenario(width, height) {
  const label = `${width}px`;
  const title = `E2E Sürüş ${width}`;
  const date = istanbulDate(2);
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  let id = null;
  try {
    await signIn(page, "admin@test.local", BASE);

    // Create: typed coordinates, a pasted place link, a pasted route link.
    await go(page, "/events/new");
    check(`${label} create form shown`, !!(await find(page, "input[data-error-key=title]")));
    await setValue(page, "input[data-error-key=title]", title);
    check(`${label} pick "Anadolu Yakası"`, await click(page, "label", "^Anadolu Yakası$"));
    await setValue(page, "input[data-error-key=startsAt]", `${date}T08:30`);
    await setValue(page, "input[data-error-key=area]", "Kadıköy → Kartal");
    await setValue(page, 'input[data-error-key="places.0.name"]', NAMES.start);
    const startBox = await find(page, 'input[data-error-key="places.0"]');
    await startBox.focus();
    await startBox.type(START_TEXT, { delay: 0 });
    await page.keyboard.press("Enter");
    check(`${label} typed coordinates read as a pin`, !!(await hasText(page, "İğne: 41.025500, 29.015400")));
    check(`${label} add a stop`, await click(page, "button", "^Durak ekle$"));
    await until(page, () => document.querySelector('input[data-error-key="places.1.name"]'));
    await setValue(page, 'input[data-error-key="places.1.name"]', NAMES.stop);
    await paste(page, 'input[data-error-key="places.1"]', PLACE_URL);
    check(`${label} place link read as a venue`, !!(await hasText(page, `Mekân: ${VENUE_LABEL}`)));
    await setValue(page, 'input[data-error-key="places.2.name"]', NAMES.finish);
    await paste(page, 'input[data-error-key="places.2"]', ROUTE_URL);
    check(`${label} route link read as its destination`, !!(await hasText(page, "İğne: 41.032201, 29.022904")));
    const boxes = await Promise.all([1, 2].map((i) => inputValue(page, `input[data-error-key="places.${i}"]`)));
    check(
      `${label} paste boxes are emptied once read`,
      boxes.every((v) => v === ""),
      JSON.stringify(boxes),
    );
    const formHtml = await page.content();
    check(
      `${label} the route origin is nowhere in the form page`,
      !ORIGIN.some((o) => formHtml.includes(o)),
      ORIGIN.filter((o) => formHtml.includes(o)).join(", "),
    );
    await page.screenshot({ path: path.join(DIR, `events-form-${width}.png`), fullPage: true });
    check(`${label} click "Oluştur"`, await click(page, "button[type=submit]", "^Oluştur$"));
    id = eventIdFromUrl(
      (await until(
        page,
        () => (/\/events\/[0-9a-f-]{36}$/.test(location.pathname) ? location.href : null),
        null,
        15000,
      )) ?? page.url(),
    );
    check(`${label} lands on the new event's page`, id !== null, page.url());
    if (!id) return;

    // What the database holds.
    const stored = storedText(id);
    check(
      `${label} origin ${ORIGIN.join(",")} in no column of events/event_places`,
      !ORIGIN.some((o) => stored.includes(o)),
    );
    const places = sql(
      `select position, name, lat, lng, coalesce(venue_url, '-'), coalesce(venue_label, '-') from event_places where event_id = '${id}' order by position`,
    );
    const expectedPlaces = [
      `0|${NAMES.start}|41.025500|29.015400|-|-`,
      `1|${NAMES.stop}|||${VENUE_URL}|${VENUE_LABEL}`,
      `2|${NAMES.finish}|41.032201|29.022904|-|-`,
    ].join("\n");
    check(
      `${label} stored places: point, venue only, destination`,
      places === expectedPlaces,
      places.replace(/\n/g, " ¶ "),
    );
    const startsAt = () =>
      sql(`select to_char(starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') from events where id = '${id}'`);
    check(`${label} start stored as UTC (08:30 Istanbul = 05:30Z)`, startsAt() === `${date}T05:30`, startsAt());

    // Event page: places and their map-app links, coordinates, sharing.
    await go(page, `/events/${id}`);
    for (const [i, [name, expected]] of EXPECTED_LINKS.entries()) {
      for (const menu of ["open", "route"]) {
        const got = await menuLinks(page, i, menu === "open" ? "Konumu aç" : "Yol tarifi");
        check(
          `${label} ${name}: "${menu === "open" ? "Konumu aç" : "Yol tarifi"}" links`,
          JSON.stringify(got) === JSON.stringify(expected[menu]),
          JSON.stringify(got),
        );
      }
    }
    const copyButtons = await page.evaluate(() =>
      [...document.querySelectorAll("[data-skeleton-result=event-places] ol > li")]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .map((li) => [...li.querySelectorAll("button")].some((b) => b.textContent.includes("Koordinatları kopyala"))),
    );
    check(
      `${label} "Koordinatları kopyala" only for the places with a point`,
      JSON.stringify(copyButtons) === "[true,false,true]",
      JSON.stringify(copyButtons),
    );
    const share = await shareHref(page);
    const shared = share ? (new URL(share).searchParams.get("text") ?? "") : "";
    check(
      `${label} WhatsApp share link has text= and no phone=`,
      !!share && share.startsWith("https://api.whatsapp.com/send?text=") && !share.includes("phone="),
      share ?? "none",
    );
    check(
      `${label} share text: title and route, no event link`,
      shared.startsWith(title) &&
        shared.includes(`${NAMES.start} → ${NAMES.finish}`) &&
        !shared.includes(`/events/${id}`),
      shared.replace(/\n/g, " ¶ "),
    );
    const pageHtml = await page.content();
    check(`${label} the route origin is nowhere in the event page`, !ORIGIN.some((o) => pageHtml.includes(o)));
    await page.screenshot({ path: path.join(DIR, `events-detail-${width}.png`), fullPage: true });

    // The list: our ride and the planted meet-up; side and kind chips filter in the browser.
    await go(page, "/events");
    const server = watchServer(page, BASE);
    const both = await titles(page);
    check(
      `${label} /events lists the new ride and the planted meet-up`,
      both.includes(title) && both.includes(MEETUP_TITLE),
      JSON.stringify(both),
    );
    check(`${label} organiser sees no "Çok yakında"`, !(await bodyText(page)).includes("Çok yakında"));
    await page.screenshot({ path: path.join(DIR, `events-list-${width}.png`), fullPage: true });
    const steps = [
      ["Avrupa", "side=european", [MEETUP_TITLE], [title]],
      ["Sürüş", "side=european&kind=ride", [], [title, MEETUP_TITLE]],
      ["Anadolu", "side=asian&kind=ride", [title], [MEETUP_TITLE]],
      ["Tümü", "", [title, MEETUP_TITLE], []],
    ];
    server.reset();
    for (const [chip, search, shown, hidden] of steps) {
      await click(page, "button[aria-pressed]", `^\\s*${chip}\\s*\\d+\\s*$`);
      const ok = await until(
        page,
        ([shown, hidden]) => {
          const ts = [...document.querySelectorAll("a[data-skeleton-result=events-row] h2")]
            .filter((h) => h.getBoundingClientRect().width > 0)
            .map((h) => h.textContent);
          return shown.every((t) => ts.includes(t)) && hidden.every((t) => !ts.includes(t));
        },
        [shown, hidden],
        5000,
      );
      const query = await page.evaluate(() => location.search.slice(1));
      check(
        `${label} chip "${chip}": list and URL follow`,
        !!ok && query === search,
        `?${query}; ${JSON.stringify(await titles(page))}`,
      );
    }
    check(`${label} chips made no server request`, server.count() === 0, server.list().join(", "));

    // Open the card, edit the start time.
    await click(page, "a[data-skeleton-result=events-row]", title);
    await until(page, (id) => location.pathname.endsWith(`/events/${id}`), id);
    check(`${label} the card opens the event`, page.url().endsWith(`/events/${id}`), page.url());
    await sleep(400);
    check(`${label} "Düzenle"`, await click(page, "a", "^\\s*Düzenle\\s*$"));
    await until(page, () => location.pathname.endsWith("/edit"));
    await until(page, () => document.querySelector("input[data-error-key=startsAt]")?.value);
    check(
      `${label} edit form holds the stored start time and the venue`,
      (await inputValue(page, "input[data-error-key=startsAt]")) === `${date}T08:30` &&
        (await bodyText(page)).includes(`Mekân: ${VENUE_LABEL}`),
      await inputValue(page, "input[data-error-key=startsAt]"),
    );
    await setValue(page, "input[data-error-key=startsAt]", `${date}T09:45`);
    check(`${label} click "Kaydet"`, await click(page, "button[type=submit]", "^Kaydet$"));
    await until(page, (id) => location.pathname.endsWith(`/events/${id}`), id, 15000);
    check(`${label} back on the event page after saving`, page.url().endsWith(`/events/${id}`), page.url());
    check(`${label} edited start stored as UTC (09:45 Istanbul = 06:45Z)`, startsAt() === `${date}T06:45`, startsAt());
    check(`${label} event page shows 09:45`, !!(await hasText(page, "09:45")));
    const afterEdit = sql(
      `select count(*) from event_places where event_id = '${id}' and (lat is not null or venue_url is not null)`,
    );
    check(`${label} places kept by the edit`, afterEdit === "3", afterEdit);
    check(`${label} still no route origin stored after the edit`, !ORIGIN.some((o) => storedText(id).includes(o)));

    // Cancel with a reason.
    const reason = "Yağmur bekleniyor";
    await sleep(400);
    check(`${label} "Etkinliği iptal et"`, await click(page, "button", "Etkinliği iptal et"));
    const area = await until(page, () => !!document.querySelector("[role=alertdialog] textarea"));
    check(`${label} cancel dialog with a reason box`, !!area);
    const textarea = await find(page, "[role=alertdialog] textarea");
    await textarea.type(reason, { delay: 0 });
    await click(page, "[role=alertdialog] button", "^\\s*İptal et\\s*$");
    const banner = await until(
      page,
      (reason) => {
        const t = document.querySelector("[data-skeleton-result=event]")?.innerText ?? "";
        return t.includes("İptal edildi") && t.includes(reason) && !document.querySelector("[role=alertdialog]");
      },
      reason,
    );
    check(`${label} cancelled banner with the reason`, !!banner);
    check(
      `${label} DB: cancelled with the reason`,
      sql(`select status || '|' || cancel_reason from events where id = '${id}'`) === `cancelled|${reason}`,
    );
    check(`${label} no "Düzenle" on a cancelled event`, !(await find(page, "a", "^\\s*Düzenle\\s*$")));
    const cancelledShare = (await shareHref(page)) ?? "";
    const cancelledText = cancelledShare ? (new URL(cancelledShare).searchParams.get("text") ?? "") : "";
    check(
      `${label} share text leads with the cancellation and the reason`,
      cancelledText.startsWith(`İPTAL: ${title}\n${reason}`),
      cancelledText.replace(/\n/g, " ¶ "),
    );
    await page.screenshot({ path: path.join(DIR, `events-cancelled-${width}.png`), fullPage: true });
    await go(page, "/events");
    const card = (await cards(page)).find((c) => c.title === title);
    check(
      `${label} list card struck through with "İptal edildi"`,
      !!card && card.struck && card.text.includes("İptal edildi"),
      JSON.stringify(card),
    );

    // Delete.
    await go(page, `/events/${id}`);
    check(`${label} "Etkinliği sil"`, await click(page, "button", "Etkinliği sil"));
    await until(page, () => !!document.querySelector("[role=alertdialog]"));
    await click(page, "[role=alertdialog] button", "^\\s*Sil\\s*$");
    const back = await until(page, () => /\/events$/.test(location.pathname), null, 15000);
    check(`${label} delete lands on /events`, !!back, page.url());
    check(
      `${label} DB: event and places gone`,
      sql(`select count(*) from events where id = '${id}'`) === "0" &&
        sql(`select count(*) from event_places where event_id = '${id}'`) === "0",
    );
    check(`${label} list no longer shows the ride`, !(await titles(page)).includes(title));
  } finally {
    await ctx.close();
  }
}

async function pastScenario(width, height) {
  const label = `${width}px`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await signIn(page, "admin@test.local", BASE);
    // Past = started over 12 hours ago and ended (listPastEvents); other local events count too.
    const allPast = Number(
      sql(
        "select count(*) from events where starts_at < now() - interval '12 hours' and (ends_at is null or ends_at < now())",
      ),
    );
    check(`${label} more than one page of past events`, allPast > 25 && allPast <= 50, `${allPast}`);
    await go(page, "/events/past");
    const text = await bodyText(page);
    check(`${label} /events/past total line`, text.includes(`${allPast} geçmiş etkinlik`), `${allPast}`);
    const first = await titles(page);
    check(
      `${label} page 1 shows 25 cards, newest first`,
      first.length === 25 && first[0] === "E2E Geçmiş 01",
      `${first.length}, ${first[0]}`,
    );
    check(`${label} range line on page 1`, text.includes(`1–25 / ${allPast} etkinlik`));
    const fit = await pagerFit(page);
    check(
      `${label} pager on one row inside the page`,
      fit.found !== false && fit.oneRow && fit.fits,
      JSON.stringify(fit),
    );
    check(`${label} pager link "2"`, await click(page, "nav[data-skeleton-result=pager] a", "^2$"));
    await until(page, () => location.search === "?page=2");
    await until(page, () => document.body.innerText.includes("26–"));
    const second = await titles(page);
    check(
      `${label} page 2 shows the rest`,
      page.url().endsWith("/events/past?page=2") && second.length === allPast - 25,
      `${page.url()} ${second.length}`,
    );
    check(`${label} range line on page 2`, (await bodyText(page)).includes(`26–${allPast} / ${allPast} etkinlik`));
    await page.screenshot({ path: path.join(DIR, `events-past-${width}.png`), fullPage: true });
    await go(page, "/events/past?page=99");
    check(`${label} ?page=99 redirects to the last page`, page.url().endsWith("/events/past?page=2"), page.url());
    await go(page, "/events/past?page=1");
    check(`${label} ?page=1 redirects to the canonical URL`, page.url().endsWith("/events/past"), page.url());
  } finally {
    await ctx.close();
  }
}

async function gateScenario(email, who, width, height) {
  const label = `${width}px ${who}`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  try {
    await signIn(page, email, BASE);
    await go(page, "/events");
    const text = await bodyText(page);
    const h1 = await page.evaluate(() =>
      [...document.querySelectorAll("h1")].filter((h) => h.getBoundingClientRect().width > 0).map((h) => h.textContent),
    );
    check(
      `${label} /events says "Çok yakında"`,
      JSON.stringify(h1) === '["Etkinlikler"]' && text.includes("Çok yakında"),
      JSON.stringify(h1),
    );
    check(`${label} /events has no "Etkinlik oluştur"`, !text.includes("Etkinlik oluştur"));
    check(`${label} /events HTML holds no event title`, !(await page.content()).includes(MEETUP_TITLE));
    for (const p of [`/events/${MEETUP_ID}`, "/events/new", "/events/past"]) {
      await go(page, p);
      // textContent: the heading is CSS-uppercased ("SAYFA BULUNAMADI" in innerText). The form's and the list's
      // labels ship with every page's client messages, so "not shown" is checked on the rendered text.
      const h1 = await page.evaluate(() =>
        [...document.querySelectorAll("h1")]
          .filter((h) => h.getBoundingClientRect().width > 0)
          .map((h) => h.textContent.trim()),
      );
      const t = await bodyText(page);
      check(
        `${label} ${p} is a 404`,
        JSON.stringify(h1) === '["Sayfa bulunamadı"]' && !t.includes("Harita linki") && !t.includes("geçmiş etkinlik"),
        JSON.stringify(h1),
      );
      check(`${label} ${p} HTML holds no event title`, !(await page.content()).includes("E2E "));
    }
  } finally {
    await ctx.close();
  }
}

try {
  plant();
  check(
    "probation fixture holds a role with events.manage",
    sql(
      `select count(*) from profiles p join role_permissions rp on rp.role_id = p.role_id where p.id = '${ID.probation}' and p.status = 'probation' and rp.permission = 'events.manage'`,
    ) === "1",
  );
  // Positive control for the gate checks: the organiser reads the planted event.
  {
    const ctx = await browser.createBrowserContext();
    const page = await newPage(ctx);
    await signIn(page, "admin@test.local", BASE);
    await go(page, `/events/${MEETUP_ID}`);
    check("control: the organiser sees the planted meet-up", (await bodyText(page)).includes(MEETUP_TITLE));
    await ctx.close();
  }
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await organiserScenario(width, height);
    await pastScenario(width, height);
    await gateScenario("member@test.local", "member", width, height);
    await gateScenario("probation@test.local", "probation organiser", width, height);
  }
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
