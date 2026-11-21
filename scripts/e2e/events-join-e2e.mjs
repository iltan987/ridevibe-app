// Events joining, behind the release gate (PASS/FAIL lines, exit code != 0 on failure; 390px and 1280px).
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123) and email sign-in enabled locally
// (docs/learnings/testing.md, "Testing as a signed-in user locally") with these fixtures:
//   admin@test.local      active, admin role (every permission: the organiser), "Test Admin"
//   member@test.local     active, no role, "Test Üye", no emergency contact, no bike of 400 cc or more
//   member2@test.local    active, no role, "İkinci Üye"
//   probation@test.local  status probation, "Ön Alım Fixture"
// Fixture recipe: the header of scripts/e2e/probation-e2e.mjs (add member2 like member).
// The gate: with the organiser-only body the member gets "Çok yakında" and a 404 on an event, and a malformed event id
// is a 404 for the organiser. Then the script opens the gate locally by replacing `private.can_see_events()` with
// `select private.is_club_member()` (the release body) through `docker exec psql`, and restores the definition from
// supabase/schemas/40_events.sql in `finally` (a warning if that fails; `pnpm db:reset` restores it too).
// Per viewport the organiser creates a ride (limits 3 people / 1 bike / 400 cc); the member (a 250 cc bike only) sees
// Sürücü disabled with the "Motor ekle" link, joins as Artçı with a guest and gets the emergency-contact nudge;
// member2 and the organiser join at once for the last place while a psql session holds the event row (both requests
// wait on the lock), and exactly one wins, the other reads "Kişi sınırı doldu."; the organiser raises the limit, the
// ön alım member sees counts but no names, joins, and on a "Sadece tam üyeler" event reads the reason; the organiser's
// roster has the "Ön alım" badge, "Acil durum kişisi yok" and safety-card buttons, the member's has names without the
// badge and "+1 yeni üye"; a start-time change shows in the "Güncellendi" box and leads the share text; "Katıldıklarım"
// filters the list with no server request; delete is disabled while people are signed up; cancelling closes joining.
// Fixture rows (events titled "E2E Katılım …" / "E2E Sadece Tam …" with their sign-ups and change log, the member's
// "E2E" bike) are planted and deleted through `docker exec psql` (DB_CONTAINER, local only) before and after the run.
// Env: PUPPETEER_DIR (required), OUT_DIR (screenshots), BASE_URL, DB_CONTAINER.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, newPage, signIn, watchServer } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) =>
  execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-c", q], {
    encoding: "utf8",
  }).trim();

const USERS = ["admin", "member", "member2", "probation"];
const ID = Object.fromEntries(USERS.map((n) => [n, sql(`select id from auth.users where email = '${n}@test.local'`)]));
for (const [who, id] of Object.entries(ID)) {
  if (!id) {
    console.log(`FAIL fixture ${who}@test.local is missing (recipe in the header of probation-e2e.mjs)`);
    process.exit(1);
  }
}
const NAME = Object.fromEntries(USERS.map((n) => [n, sql(`select full_name from profiles where id = '${ID[n]}'`)]));

// The gate as the schema defines it (organisers only until the release), and the release body for this run.
const GATE_SQL = /create or replace function private\.can_see_events\(\)[\s\S]*?\$\$;/.exec(
  readFileSync(path.join(REPO, "supabase/schemas/40_events.sql"), "utf8"),
)?.[0];
if (!GATE_SQL || !GATE_SQL.includes("select private.has_permission('events.manage')")) {
  console.log("FAIL can't read the gate function from supabase/schemas/40_events.sql");
  process.exit(1);
}
const OPEN_GATE_SQL = GATE_SQL.replace(
  "select private.has_permission('events.manage')",
  "select private.is_club_member()",
);
const gateBody = () =>
  sql("select prosrc from pg_proc where proname = 'can_see_events' and pronamespace = 'private'::regnamespace");

const BIKE = { brand: "E2E", model: "Vespa", cc: 250 };
const MIN_CC = 400;

function clean() {
  sql("delete from events where title like 'E2E Katılım %' or title like 'E2E Sadece Tam %'");
  sql(`delete from member_motorcycles where profile_id = '${ID.member}' and brand = '${BIKE.brand}'`);
}
/** A "Sadece tam üyeler" meet-up in three days (a real v4 id: the app's z.uuid() refuses readable ones). */
function plantFullMembersOnly(width) {
  const id = sql(
    `insert into events (kind, title, side, starts_at, full_members_only) values ('meetup', 'E2E Sadece Tam ${width}', 'asian', now() + interval '3 days', true) returning id`,
  ).split("\n")[0];
  sql(
    `insert into event_places (event_id, position, name, lat, lng) values ('${id}', 0, 'E2E Moda', 41.0255, 29.0154)`,
  );
  return id;
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
const hasText = (page, text, ms = 8000) => until(page, (t) => document.body.innerText.includes(t), text, ms);
/** First visible element matching selector (and text regexp source on its textContent), as a handle. */
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
const eventIdFromUrl = (url) =>
  /\/events\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.exec(new URL(url).pathname)?.[1] ?? null;
/** "YYYY-MM-DD" in Istanbul (UTC+3, no DST), `days` from now. */
const istanbulDate = (days) => new Date(Date.now() + days * 864e5 + 3 * 36e5).toISOString().slice(0, 10);

/** The visible join panel: heading, text, the role radios (checked/disabled), buttons (label/disabled), guests. */
const panel = (page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll("section[data-skeleton-result=event-join]")].find(
      (e) => e.getBoundingClientRect().width > 0,
    );
    if (!s) return null;
    const radios = Object.fromEntries(
      [...s.querySelectorAll("label")]
        .filter((l) => l.querySelector("[data-slot=radio-group-item]"))
        .map((l) => {
          const r = l.querySelector("[data-slot=radio-group-item]");
          return [
            l.querySelector("span.font-medium")?.textContent ?? "",
            { checked: r.hasAttribute("data-checked"), disabled: r.hasAttribute("data-disabled") },
          ];
        }),
    );
    const buttons = Object.fromEntries(
      [...s.querySelectorAll("button")]
        .filter((b) => !b.closest("[role=alertdialog]") && !b.getAttribute("role"))
        .map((b) => [b.getAttribute("aria-label") ?? b.textContent.trim(), b.disabled]),
    );
    return {
      heading: s.querySelector("h2")?.textContent ?? "",
      text: s.innerText,
      radios,
      buttons,
      guests: s.querySelector("output")?.textContent ?? null,
      status: s.querySelector("p[aria-live]")?.textContent ?? "",
      links: [...s.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
    };
  });
/** The visible roster: heading total and rows (text, badges, safety button). Null without a roster section. */
const roster = (page) =>
  page.evaluate(() => {
    const s = [...document.querySelectorAll("section[data-skeleton-result=event-roster]")].find(
      (e) => e.getBoundingClientRect().width > 0,
    );
    if (!s) return null;
    return {
      total: s.querySelector("h2")?.nextElementSibling?.textContent ?? "",
      rows: [...s.querySelectorAll("li")].map((li) => ({
        name: li.querySelector("p")?.textContent ?? "",
        text: li.innerText,
        badges: [...li.querySelectorAll("[data-slot=badge]")].map((b) => b.textContent),
        safety: [...li.querySelectorAll("button")].some((b) => b.textContent.includes("Acil durum")),
      })),
    };
  });
/** The "Güncellendi" box's text, or null. */
const changeBox = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("section")]
        .filter((e) => e.getBoundingClientRect().width > 0)
        .find((e) => e.querySelector("h2")?.textContent.trim() === "Güncellendi")?.innerText ?? null,
  );
const countsText = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("[data-skeleton-result=event-counts]")].find(
        (e) => e.getBoundingClientRect().width > 0,
      )?.textContent ?? null,
  );
const shareHref = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("a")]
        .find((a) => a.getBoundingClientRect().width > 0 && a.textContent.includes("WhatsApp'ta paylaş"))
        ?.getAttribute("href") ?? null,
  );
const signups = (id) =>
  sql(
    `select string_agg(p.full_name || ':' || s.role || ':' || s.guests, ',' order by p.full_name) from event_signups s join profiles p on p.id = s.profile_id where s.event_id = '${id}'`,
  );

/** Signed-in page in its own browser context. */
async function as(who, width, height) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  await signIn(page, `${who}@test.local`, BASE);
  return { ctx, page };
}

/** Saves the edit form after `fill(page)`; returns to the event page. */
async function editEvent(page, id, label, fill) {
  await go(page, `/events/${id}/edit`);
  await until(page, () => document.querySelector("input[data-error-key=startsAt]")?.value);
  await fill(page);
  check(`${label} click "Kaydet"`, await click(page, "button[type=submit]", "^Kaydet$"));
  await until(page, (id) => location.pathname.endsWith(`/events/${id}`), id, 15000);
  await sleep(400);
}

async function gateClosedScenario(fmoId) {
  check(
    "gate body is organisers-only before the run",
    gateBody().trim() === "select private.has_permission('events.manage')",
    gateBody(),
  );
  const { ctx, page } = await as("member", 390, 844);
  try {
    await go(page, "/events");
    check('gate closed: member gets "Çok yakında" on /events', (await bodyText(page)).includes("Çok yakında"));
    await go(page, `/events/${fmoId}`);
    const h1 = await page.evaluate(() =>
      [...document.querySelectorAll("h1")]
        .filter((h) => h.getBoundingClientRect().width > 0)
        .map((h) => h.textContent.trim()),
    );
    check(
      "gate closed: member gets a 404 on an event",
      JSON.stringify(h1) === '["Sayfa bulunamadı"]',
      JSON.stringify(h1),
    );
    check("gate closed: the 404 holds no event title", !(await page.content()).includes("E2E Sadece Tam"));
  } finally {
    await ctx.close();
  }
  const admin = await as("admin", 390, 844);
  try {
    await go(admin.page, "/events/not-a-uuid");
    const h1 = await admin.page.evaluate(() =>
      [...document.querySelectorAll("h1")]
        .filter((h) => h.getBoundingClientRect().width > 0)
        .map((h) => h.textContent.trim()),
    );
    check("organiser: /events/not-a-uuid is a 404", JSON.stringify(h1) === '["Sayfa bulunamadı"]', JSON.stringify(h1));
  } finally {
    await admin.ctx.close();
  }
}

async function joinScenario(width, height, fmoId) {
  const label = `${width}px`;
  const title = `E2E Katılım ${width}`;
  const date = istanbulDate(2);
  const org = await as("admin", width, height);
  const mem = await as("member", width, height);
  const mem2 = await as("member2", width, height);
  const prob = await as("probation", width, height);
  try {
    // The organiser creates a ride: 3 people, 1 bike, 400 cc.
    const p = org.page;
    await go(p, "/events/new");
    await setValue(p, "input[data-error-key=title]", title);
    await click(p, "label", "^Anadolu Yakası$");
    await setValue(p, "input[data-error-key=startsAt]", `${date}T08:30`);
    await setValue(p, "input[data-error-key=area]", "Kadıköy → Kartal");
    for (const [i, name, coords] of [
      [0, "E2E Başlangıç", "41.0255, 29.0154"],
      [1, "E2E Varış", "41.0322, 29.0229"],
    ]) {
      await setValue(p, `input[data-error-key="places.${i}.name"]`, name);
      const box = await find(p, `input[data-error-key="places.${i}"]`);
      await box.focus();
      await box.type(coords, { delay: 0 });
      await p.keyboard.press("Enter");
      await hasText(
        p,
        `İğne: ${coords
          .split(", ")
          .map((c) => Number(c).toFixed(6))
          .join(", ")}`,
      );
    }
    await setValue(p, "input[data-error-key=limitPeople]", "3");
    await setValue(p, "input[data-error-key=limitBikes]", "1");
    await setValue(p, "input[data-error-key=minCc]", String(MIN_CC));
    check(`${label} organiser: click "Oluştur"`, await click(p, "button[type=submit]", "^Oluştur$"));
    const id = eventIdFromUrl(
      (await until(
        p,
        () => (/\/events\/[0-9a-f-]{36}$/.test(location.pathname) ? location.href : null),
        null,
        15000,
      )) ?? p.url(),
    );
    check(`${label} organiser lands on the new ride`, id !== null, p.url());
    if (!id) {
      await p.screenshot({ path: path.join(DIR, `events-join-form-${width}.png`), fullPage: true });
      return;
    }
    check(
      `${label} DB: limits 3 / 1 / 400 cc`,
      sql(`select limit_people || '/' || limit_bikes || '/' || min_cc from events where id = '${id}'`) === "3/1/400",
    );

    // The member: Sürücü disabled (250 cc < 400) with "Motor ekle", joins as Artçı with one guest.
    const m = mem.page;
    await go(m, `/events/${id}`);
    let jp = await panel(m);
    check(`${label} member: join panel "Katılıyor musun?"`, jp?.heading === "Katılıyor musun?", jp?.heading);
    check(
      `${label} member: Sürücü disabled, Artçı picked`,
      jp?.radios["Sürücü"]?.disabled === true && jp?.radios["Artçı"]?.checked === true,
      JSON.stringify(jp?.radios),
    );
    check(
      `${label} member: min cc reason with "Motor ekle" → /account#motorcycles`,
      !!jp?.text.includes(`en az ${MIN_CC} cc bir motor olmalı`) &&
        jp.links.some(([t, h]) => t === "Motor ekle" && h === "/account#motorcycles"),
      JSON.stringify(jp?.links),
    );
    check(
      `${label} member: no organiser controls`,
      !(await find(m, "a", "^\\s*Düzenle\\s*$")) && !(await find(m, "button", "Etkinliği sil")),
    );
    await click(m, "button[aria-label='Bir misafir ekle']");
    await until(
      m,
      () => document.querySelector("section[data-skeleton-result=event-join] output")?.textContent === "1",
    );
    check(`${label} member: one guest`, (await panel(m))?.guests === "1");
    check(
      `${label} member: click "Katılıyorum"`,
      await click(m, "section[data-skeleton-result=event-join] button", "^Katılıyorum$"),
    );
    check(`${label} member: "Katılımın kaydedildi."`, !!(await hasText(m, "Katılımın kaydedildi.")));
    check(
      `${label} DB: member joined as passenger with a guest`,
      signups(id) === `${NAME.member}:passenger:1`,
      signups(id),
    );
    await until(m, () => document.body.innerText.includes("Acil durum kişin yok"));
    jp = await panel(m);
    check(
      `${label} member: emergency nudge → /account#emergency`,
      !!jp?.text.includes("Acil durum kişin yok") &&
        jp.links.some(([t, h]) => t === "Acil durum kişisi ekle" && h === "/account#emergency"),
      JSON.stringify(jp?.links),
    );
    check(
      `${label} member: panel says "Katılıyorsun", "Artçı · 1 misafir"`,
      !!(await until(m, () => {
        const s = document.querySelector("section[data-skeleton-result=event-join]");
        return s?.querySelector("h2")?.textContent === "Katılıyorsun" && s.innerText.includes("Artçı · 1 misafir");
      })),
    );
    await m.screenshot({ path: path.join(DIR, `events-join-member-${width}.png`), fullPage: true });

    // The last place: member2 and the organiser at once. A psql session holds the event row, so both join_event calls
    // are in flight together and wait on the lock; then exactly one gets the place.
    await go(mem2.page, `/events/${id}`);
    await go(p, `/events/${id}`);
    for (const page of [mem2.page, p]) await click(page, "section[data-skeleton-result=event-join] label", "^Artçı");
    const holder = spawn("docker", [
      "exec",
      DB,
      "psql",
      "-U",
      "postgres",
      "-c",
      `begin; select 1 from events where id = '${id}' for update; select pg_sleep(3); commit;`,
    ]);
    const held = new Promise((r) => holder.on("close", r));
    await sleep(600);
    await Promise.all(
      [mem2.page, p].map((page) => click(page, "section[data-skeleton-result=event-join] button", "^Katılıyorum$")),
    );
    let waiting = 0;
    for (let i = 0; i < 20 && waiting < 2; i++) {
      waiting = Number(
        sql(
          "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%join_event%' and pid <> pg_backend_pid()",
        ),
      );
      if (waiting < 2) await sleep(100);
    }
    check(`${label} race: both join_event calls wait on the event row`, waiting === 2, `${waiting}`);
    await held;
    const outcome = async (page) =>
      until(
        page,
        () => {
          const t = document.querySelector("section[data-skeleton-result=event-join] p[aria-live]")?.textContent ?? "";
          return t === "Katılımın kaydedildi." || t === "Kişi sınırı doldu." ? t : null;
        },
        null,
        15000,
      );
    const [o2, oOrg] = await Promise.all([outcome(mem2.page), outcome(p)]);
    check(
      `${label} race: exactly one wins, the other reads "Kişi sınırı doldu."`,
      [o2, oOrg].sort().join("|") === "Katılımın kaydedildi.|Kişi sınırı doldu.",
      `member2: ${o2}; organiser: ${oOrg}`,
    );
    const winner = o2 === "Katılımın kaydedildi." ? "member2" : "admin";
    check(
      `${label} DB: two sign-ups, 3 people`,
      sql(`select count(*) || '/' || sum(1 + guests) from event_signups where event_id = '${id}'`) === "2/3",
      signups(id),
    );

    // The organiser raises the people limit; the change box lists it.
    await editEvent(p, id, `${label} organiser: limit 3 → 4`, (page) =>
      setValue(page, "input[data-error-key=limitPeople]", "4"),
    );
    check(
      `${label} change box: "Kişi sınırı: 3 → 4"`,
      !!(await changeBox(p))?.includes("Kişi sınırı: 3 → 4"),
      (await changeBox(p))?.replace(/\n/g, " ¶ "),
    );

    // The ön alım member: counts, no names, joins; the "Sadece tam üyeler" event refuses with the reason.
    const pr = prob.page;
    await go(pr, `/events/${id}`);
    check(
      `${label} probation: counts line "3 / 4 kişi · 0 / 1 motor"`,
      (await countsText(pr)) === "Katılım: 3 / 4 kişi · 0 / 1 motor",
      await countsText(pr),
    );
    check(`${label} probation: no roster`, (await roster(pr)) === null);
    const prHtml = await pr.content();
    const leaked = [NAME.member, NAME.member2].filter((n) => prHtml.includes(n));
    check(`${label} probation: no participant name in the HTML`, leaked.length === 0, leaked.join(", "));
    await click(pr, "section[data-skeleton-result=event-join] label", "^Artçı");
    check(
      `${label} probation: click "Katılıyorum"`,
      await click(pr, "section[data-skeleton-result=event-join] button", "^Katılıyorum$"),
    );
    check(`${label} probation: "Katılımın kaydedildi."`, !!(await hasText(pr, "Katılımın kaydedildi.")));
    await pr.screenshot({ path: path.join(DIR, `events-join-probation-${width}.png`), fullPage: true });
    await go(pr, `/events/${fmoId}`);
    jp = await panel(pr);
    check(
      `${label} probation: "Sadece tam üyeler" event shows the reason, joining disabled`,
      !!jp?.text.includes("Bu etkinlik sadece tam üyeler için.") && jp.buttons["Katılıyorum"] === true,
      JSON.stringify(jp?.buttons),
    );

    // The organiser's roster: everyone counted, the ön alım badge, "Acil durum kişisi yok", safety cards.
    await go(p, `/events/${id}`);
    const orgRoster = await roster(p);
    const rowOf = (r, who) => r?.rows.find((row) => row.name === NAME[who]);
    check(`${label} organiser roster: 3 üye`, orgRoster?.total === "3 üye", orgRoster?.total);
    check(
      `${label} organiser roster: "Ön alım" badge on the ön alım member only`,
      !!rowOf(orgRoster, "probation")?.badges.includes("Ön alım") &&
        !rowOf(orgRoster, "member")?.badges.includes("Ön alım"),
      JSON.stringify(orgRoster?.rows.map((r) => [r.name, r.badges])),
    );
    check(
      `${label} organiser roster: member row "Artçı · +1 misafir", "Acil durum kişisi yok"`,
      !!rowOf(orgRoster, "member")?.text.includes("Artçı · +1 misafir") &&
        !!rowOf(orgRoster, "member")?.badges.includes("Acil durum kişisi yok"),
      rowOf(orgRoster, "member")?.text.replace(/\n/g, " ¶ "),
    );
    check(
      `${label} organiser roster: a safety-card button per row`,
      !!orgRoster && orgRoster.rows.length === 3 && orgRoster.rows.every((r) => r.safety),
    );
    check(
      `${label} organiser counts line "4 / 4 kişi · 0 / 1 motor"`,
      (await countsText(p)) === "Katılım: 4 / 4 kişi · 0 / 1 motor",
      await countsText(p),
    );
    await p.screenshot({ path: path.join(DIR, `events-join-organiser-${width}.png`), fullPage: true });

    // The member's roster: active participants' names, no badge, the ön alım member as "+1 yeni üye".
    await go(m, `/events/${id}`);
    const memRoster = await roster(m);
    check(
      `${label} member roster: "2 üye · +1 yeni üye"`,
      memRoster?.total === "2 üye · +1 yeni üye",
      memRoster?.total,
    );
    check(
      `${label} member roster: the member and the winner, no ön alım name`,
      JSON.stringify(memRoster?.rows.map((r) => r.name).sort()) ===
        JSON.stringify([NAME.member, NAME[winner]].sort()) && !(await m.content()).includes(NAME.probation),
      JSON.stringify(memRoster?.rows.map((r) => r.name)),
    );
    check(
      `${label} member roster: no badges, no safety buttons`,
      !!memRoster && memRoster.rows.every((r) => r.badges.length === 0 && !r.safety),
    );

    // The organiser moves the start: the change box and the share text's lead line.
    await editEvent(p, id, `${label} organiser: start 08:30 → 09:45`, (page) =>
      setValue(page, "input[data-error-key=startsAt]", `${date}T09:45`),
    );
    const box = await changeBox(p);
    check(
      `${label} change box: "Başlangıç: 08:30 → 09:45"`,
      !!box?.includes("Başlangıç: 08:30 → 09:45"),
      box?.replace(/\n/g, " ¶ "),
    );
    check(`${label} change box: the author for the organiser`, !!box?.includes(NAME.admin));
    const share = await shareHref(p);
    const shared = share ? (new URL(share).searchParams.get("text") ?? "") : "";
    check(
      `${label} share text starts with the lead line "Güncellendi: saat 09:45"`,
      shared.startsWith(`Güncellendi: saat 09:45\n${title}\n`),
      shared.replace(/\n/g, " ¶ "),
    );
    await go(m, `/events/${id}`);
    const memBox = await changeBox(m);
    check(
      `${label} member: change box without the author`,
      !!memBox?.includes("Başlangıç: 08:30 → 09:45") && !memBox.includes(NAME.admin),
      memBox?.replace(/\n/g, " ¶ "),
    );

    // "Katıldıklarım": the member's list filters in the browser.
    await go(m, "/events");
    const server = watchServer(m, BASE);
    const visibleTitles = () =>
      m.evaluate(() =>
        [...document.querySelectorAll("a[data-skeleton-result=events-row] h2")]
          .filter((h) => h.getBoundingClientRect().width > 0)
          .map((h) => h.textContent),
      );
    const before = await visibleTitles();
    check(
      `${label} member list: the ride and the "Sadece tam üyeler" meet-up`,
      before.includes(title) && before.includes(`E2E Sadece Tam ${width}`),
      JSON.stringify(before),
    );
    check(`${label} member list: no "Etkinlik oluştur"`, !(await bodyText(m)).includes("Etkinlik oluştur"));
    const card = await m.evaluate(
      (title) =>
        [...document.querySelectorAll("a[data-skeleton-result=events-row]")]
          .filter((a) => a.getBoundingClientRect().width > 0)
          .find((a) => a.querySelector("h2")?.textContent === title)?.innerText ?? "",
      title,
    );
    check(
      `${label} member list: the ride's card says "Katılıyorsun" and "4 / 4 kişi"`,
      card.includes("Katılıyorsun") && card.includes("4 / 4 kişi"),
      card.replace(/\n/g, " ¶ "),
    );
    server.reset();
    await click(m, "button[aria-pressed]", "^\\s*Katıldıklarım\\s*\\d+\\s*$");
    const mine = await until(
      m,
      ([title, other]) => {
        const ts = [...document.querySelectorAll("a[data-skeleton-result=events-row] h2")]
          .filter((h) => h.getBoundingClientRect().width > 0)
          .map((h) => h.textContent);
        return ts.includes(title) && !ts.includes(other) && location.search === "?mine=1";
      },
      [title, `E2E Sadece Tam ${width}`],
      5000,
    );
    check(`${label} "Katıldıklarım": only joined events, ?mine=1`, !!mine, JSON.stringify(await visibleTitles()));
    check(`${label} "Katıldıklarım": no server request`, server.count() === 0, server.list().join(", "));
    await m.screenshot({ path: path.join(DIR, `events-join-mine-${width}.png`), fullPage: true });

    // Delete is disabled while people are signed up; cancel works and closes joining.
    await go(p, `/events/${id}`);
    const del = await find(p, "button", "Etkinliği sil");
    check(
      `${label} organiser: "Etkinliği sil" disabled with the hint`,
      !!del &&
        (await del.evaluate((b) => b.disabled)) &&
        (await bodyText(p)).includes("Katılan var; silmek yerine iptal edebilirsin."),
    );
    check(`${label} organiser: "Etkinliği iptal et"`, await click(p, "button", "Etkinliği iptal et"));
    await until(p, () => !!document.querySelector("[role=alertdialog] textarea"));
    await click(p, "[role=alertdialog] button", "^\\s*İptal et\\s*$");
    check(
      `${label} organiser: cancelled banner`,
      !!(await until(
        p,
        () =>
          (document.querySelector("[data-skeleton-result=event]")?.innerText ?? "").includes("İptal edildi") &&
          !document.querySelector("[role=alertdialog]"),
      )),
    );
    check(
      `${label} DB: cancelled, sign-ups kept`,
      sql(`select status from events where id = '${id}'`) === "cancelled" && signups(id).split(",").length === 3,
    );
    check(
      `${label} organiser: delete still disabled ("Katılan olduğu için silinemez.")`,
      !!(await hasText(p, "Katılan olduğu için silinemez.")),
    );
    await go(m, `/events/${id}`);
    jp = await panel(m);
    check(
      `${label} member: cancelled event closes joining (reason, summary, no buttons)`,
      !!jp?.text.includes("Etkinlik iptal edildi; katılım kapandı.") &&
        jp.text.includes("Artçı · 1 misafir") &&
        Object.keys(jp.buttons).length === 0,
      JSON.stringify(jp),
    );
    await m.screenshot({ path: path.join(DIR, `events-join-cancelled-${width}.png`), fullPage: true });
  } finally {
    for (const s of [org, mem, mem2, prob]) await s.ctx.close();
  }
}

let opened = false;
try {
  clean();
  check(
    "fixture: member has no emergency contact",
    sql(`select count(*) from member_emergency_contacts where profile_id = '${ID.member}'`) === "0",
  );
  check(
    `fixture: member has no bike of ${MIN_CC} cc or more`,
    sql(`select count(*) from member_motorcycles where profile_id = '${ID.member}' and cc >= ${MIN_CC}`) === "0",
  );
  check(
    "fixture: probation@ is ön alım",
    sql(`select status from profiles where id = '${ID.probation}'`) === "probation",
  );
  sql(
    `insert into member_motorcycles (profile_id, brand, model, cc) values ('${ID.member}', '${BIKE.brand}', '${BIKE.model}', ${BIKE.cc})`,
  );
  const fmo = { 390: plantFullMembersOnly(390), 1280: plantFullMembersOnly(1280) };
  await gateClosedScenario(fmo[390]);

  sql(OPEN_GATE_SQL);
  opened = true;
  check("gate opened locally (release body)", gateBody().trim() === "select private.is_club_member()", gateBody());
  for (const [width, height] of [
    [390, 844],
    [1280, 900],
  ]) {
    await joinScenario(width, height, fmo[width]);
  }
} catch (e) {
  fails++;
  console.log("FAIL unexpected error —", e.stack ?? e);
} finally {
  // Cleanup must not hide the real failure above.
  try {
    sql(GATE_SQL);
    const body = gateBody().trim();
    check("gate restored to organisers only", body === "select private.has_permission('events.manage')", body);
  } catch (e) {
    fails++;
    console.log(
      `FAIL WARNING: the gate could not be restored${opened ? " and is OPEN" : ""} (run pnpm db:reset) —`,
      e.message,
    );
  }
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
