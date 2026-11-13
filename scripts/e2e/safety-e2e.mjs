// Safety data E2E (emergency contacts, blood type, plates, safety card, access log). Needs a production server on
// :3123 (pnpm build && pnpm start -p 3123) and email sign-in enabled locally (docs/learnings/testing.md, "Testing as a
// signed-in user locally") with exactly these active fixtures and no other active members that matter for totals
// (the script reads totals relative to its own plants, but "no contact" counts include every active member):
//   admin@test.local     active, "Test Admin", admin role (holds members.safety)
//   member@test.local    active, "Test Üye"
//   second@test.local    active, "Çelik Fixture", plain member
//   inactive@test.local  status inactive, "Pasif Fixture"
// Fixture recipe (local stack only; password test-password-123; SECRET_KEY from `pnpm exec supabase status -o env`):
//   1. for u in admin member second inactive; do curl -sf -o /dev/null -X POST \
//        http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
//        -d "{\"email\":\"$u@test.local\",\"password\":\"test-password-123\",\"email_confirm\":true}"; done
//   2. docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
//        update profiles set status = 'active' where id in (select id from auth.users where email in
//          ('admin@test.local', 'member@test.local', 'second@test.local'));
//        update profiles set status = 'inactive' where id in (select id from auth.users where email = 'inactive@test.local');
//        update profiles set role_id = (select id from roles where is_admin)
//          where id = (select id from auth.users where email = 'admin@test.local');
//        update profiles p set full_name = v.n from auth.users u, (values ('admin@test.local', 'Test Admin'),
//          ('member@test.local', 'Test Üye'), ('second@test.local', 'Çelik Fixture'), ('inactive@test.local', 'Pasif Fixture'))
//          v(e, n) where u.email = v.e and p.id = u.id;
//      SQL
//   Cleanup: delete from applications where email like '%@test.local'; delete from auth.users where email like '%@test.local';
// The script plants and deletes emergency contacts, blood types, bikes and access-log rows of these fixtures through
// `docker exec psql` (DB_CONTAINER, local only) before and after every run.
// Env: PUPPETEER_DIR (required), OUT_DIR (screenshots, default: OS temp dir), DB_CONTAINER (default supabase_db_ridevibe).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launch, newPage, signIn, watchServer } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) => execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();

const ID = Object.fromEntries(
  ["admin", "member", "second", "inactive"].map((n) => [n, sql(`select id from auth.users where email = '${n}@test.local'`)]),
);
const IDS = Object.values(ID).map((i) => `'${i}'`).join(",");
/** Planted rows of the fixtures only (never real members). */
function clean() {
  sql(`delete from safety_access_log where actor_id in (${IDS}) or target_id in (${IDS})`);
  sql(`delete from member_emergency_contacts where profile_id in (${IDS})`);
  sql(`delete from member_health where profile_id in (${IDS})`);
  // Only what this script plants: members-e2e.mjs shares these fixtures (e.g. second's Honda CB500).
  sql(`delete from member_motorcycles where profile_id = '${ID.member}' and brand = 'Yamaha' and model = 'MT-07'`);
  sql(`update member_details set show_plates = true where profile_id = '${ID.member}' and show_plates = false`);
}
const contactCount = (id) => Number(sql(`select count(*) from member_emergency_contacts where profile_id = '${id}'`));
const logCount = (actor, action, target) =>
  Number(sql(`select count(*) from safety_access_log where actor_id = '${actor}' and action = '${action}'${target ? ` and target_id = '${target}'` : ""}`));

const browser = await launch();

/** Runs one scenario in its own context; always closes it and records a crash as a FAIL. */
async function scenario(name, email, fn) {
  const ctx = await browser.createBrowserContext();
  try {
    const page = await newPage(ctx);
    await signIn(page, email, BASE);
    await fn(page);
  } catch (e) {
    check(`${name}: finished without an exception`, false, e.message);
  } finally {
    await ctx.close();
  }
}
async function go(page, p) {
  await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(400); // hydration
}
const bodyText = (page) => page.evaluate(() => document.body.innerText);
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
  if (!el) return false;
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
  return true;
}
async function typeInto(el, value) {
  await el.focus();
  await el.click();
  await el.evaluate((i) => i.select());
  await el.press("Backspace");
  await el.type(value);
}
const hasText = (page, re) => until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags], 8000);
const dialogVisible = (page, role = "dialog") =>
  until(page, (r) => [...document.querySelectorAll(`[role=${r}]`)].some((e) => e.getBoundingClientRect().width > 0), role);
const dialogGone = (page, role = "dialog") =>
  until(page, (r) => ![...document.querySelectorAll(`[role=${r}]`)].some((e) => e.getBoundingClientRect().width > 0), role);
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `safety-${name}.png`), fullPage: true });
/** Clicks the "Kaydet" submit button of the visible form that contains `inner` (a selector). */
async function submitFormOf(page, inner) {
  const h = await page.evaluateHandle((inner) => {
    const el = [...document.querySelectorAll(inner)].find((e) => e.getBoundingClientRect().width > 0);
    // The visibility form also holds the one-time birth-date button (members without a date): pick "Kaydet".
    return [...(el?.closest("form")?.querySelectorAll("button[type=submit]") ?? [])].find((b) => b.textContent.trim() === "Kaydet") ?? null;
  }, inner);
  const el = h.asElement();
  if (!el) return false;
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
  return true;
}
/** Fills and saves the open "add contact" dialog. */
async function addContact(page, name, phone, relationship = "friend") {
  await click(page, "#emergency button", "Kişi ekle");
  await dialogVisible(page);
  await typeInto(await find(page, "[role=dialog] input[name=name]"), name);
  await page.select("[role=dialog] select[name=relationship]", relationship);
  await typeInto(await find(page, "[role=dialog] input#phone"), phone);
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
}
const sectionText = (page) => page.evaluate(() => document.querySelector("#emergency")?.innerText ?? "");
const total = (page) => page.evaluate(() => document.querySelector("[data-skeleton-result=members-total] p")?.textContent);
const memberCard = (page, name) =>
  page.evaluate(
    (name) => [...document.querySelectorAll("li[data-skeleton-result=members-row]")].find((li) => li.textContent.includes(name))?.innerText ?? null,
    name,
  );
/** The visible directory: total, card names, search box text, pressed side chip. */
const listState = (page) =>
  page.evaluate(() => {
    const vis = (e) => e.getBoundingClientRect().width > 0;
    return {
      total: [...document.querySelectorAll("[data-skeleton-result=members-total] p")].find(vis)?.textContent ?? null,
      names: [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")].filter(vis).map((p) => p.textContent),
      value: [...document.querySelectorAll("input[type=search]")].find(vis)?.value ?? null,
      chip: [...document.querySelectorAll("[data-skeleton-result=members-chips] button[aria-pressed=true]")].find(vis)?.firstChild?.textContent ?? null,
    };
  });
const switchFor = (page, text) =>
  page.evaluateHandle(
    (text) =>
      [...document.querySelectorAll("label")]
        .filter((l) => l.getBoundingClientRect().width > 0 && l.textContent.includes(text))
        .map((l) => l.querySelector("[role=switch]"))[0] ?? null,
    text,
  );

clean();

// 1 emergency contacts (member)
await scenario("contacts", "member@test.local", async (page) => {
  await go(page, "/account");
  check("contacts: prompt card shown without contacts", (await bodyText(page)).includes("Sürüşler için acil durum kişisi ekle"));
  const href = await page.evaluate(() => [...document.querySelectorAll("a")].find((a) => a.textContent.trim() === "Kişi ekle")?.getAttribute("href"));
  check("contacts: prompt links to #emergency", href === "#emergency", String(href));

  await addContact(page, "Ayşe Yılmaz", "05321234567");
  check("contacts: add dialog closes", !!(await dialogGone(page)));
  check("contacts: first contact listed with formatted phone", !!(await hasText(page, /Ayşe Yılmaz[\s\S]*Arkadaş · \+90 532 123 45 67/)));
  check("contacts: prompt gone after the first contact", !(await bodyText(page)).includes("Sürüşler için acil durum kişisi ekle"));
  check("contacts: stored once", contactCount(ID.member) === 1);
  await shot(page, "contacts-one");

  await addContact(page, "Mehmet Demir", "05339876543", "parent");
  check("contacts: second add dialog closes", !!(await dialogGone(page)));
  await hasText(page, /Mehmet Demir/);
  const addBtn = await find(page, "#emergency button", "Kişi ekle");
  const full = await addBtn.evaluate((b) => b.disabled);
  const t2 = await sectionText(page);
  check("contacts: active member has edit buttons (label exists)", !!(await find(page, "#emergency button", "kişisini düzenle")));
  check("contacts: two contacts -> 'Kişi ekle' disabled with the limit hint", full && t2.includes("En fazla 2 acil durum kişisi ekleyebilirsin.") && /Ayşe Yılmaz\s*\(ana kişi\)/.test(t2), t2.replace(/\n/g, " | "));
  await shot(page, "contacts-two");

  await click(page, "#emergency button", "Ayşe Yılmaz kişisini sil");
  await dialogVisible(page, "alertdialog");
  await click(page, "[role=alertdialog] button", "^Sil$");
  check("contacts: delete confirm closes", !!(await dialogGone(page, "alertdialog")));
  await until(page, () => !document.querySelector("#emergency")?.innerText.includes("Ayşe Yılmaz"), null);
  check("contacts: first contact deleted", contactCount(ID.member) === 1 && !(await sectionText(page)).includes("Ayşe"));

  await addContact(page, "Zeynep Kaya", "05301112233", "sibling");
  await dialogGone(page);
  await hasText(page, /Zeynep Kaya/);
  const t3 = await sectionText(page);
  check("contacts: re-added contact becomes the main one (position 1)", /Zeynep Kaya\s*\(ana kişi\)/.test(t3) && !/Mehmet Demir\s*\(ana kişi\)/.test(t3) && sql(`select name from member_emergency_contacts where profile_id = '${ID.member}' and position = 1`) === "Zeynep Kaya", t3.replace(/\n/g, " | "));

  // landline is rejected: delete one to make room first
  await click(page, "#emergency button", "Mehmet Demir kişisini sil");
  await dialogVisible(page, "alertdialog");
  await click(page, "[role=alertdialog] button", "^Sil$");
  await dialogGone(page, "alertdialog");
  await until(page, () => !document.querySelector("#emergency")?.innerText.includes("Mehmet Demir"), null);
  await addContact(page, "Sabit Hat", "2161234567");
  const err = await hasText(page, /Türkiye numarası 5 ile başlayan bir cep telefonu olmalı/);
  check("contacts: +90 216 number shows the mobile error, dialog stays open", !!err && !!(await find(page, "[role=dialog]")) && contactCount(ID.member) === 1);
  await shot(page, "contacts-landline");
});
clean();

// 2 blood type (member)
await scenario("blood", "member@test.local", async (page) => {
  await go(page, "/account");
  const text0 = await bodyText(page);
  check("blood: consent text and unticked checkbox", text0.includes("açık rıza veriyorum") && (await (await find(page, "[role=checkbox]")).evaluate((c) => c.getAttribute("aria-checked"))) === "false");
  await page.select("#profile-blood-type", "0-");
  const save = async () => (await find(page, "#profile-blood-type") ? page.evaluate(() => {
    const b = document.querySelector("#profile-blood-type").closest("form").querySelector("button[type=submit]");
    return b.disabled;
  }) : null);
  check("blood: save disabled without the consent tick (the form cannot send consentRequired)", (await save()) === true && Number(sql(`select count(*) from member_health where profile_id = '${ID.member}'`)) === 0);
  await click(page, "[role=checkbox]");
  check("blood: save enabled after ticking", (await save()) === false);
  await submitFormOf(page, "#profile-blood-type");
  check("blood: saved type shown as '0 Rh−'", !!(await hasText(page, /Kan grubun: 0 Rh−/)));
  check("blood: stored with consent", sql(`select blood_type || '|' || consent_blood_type from member_health where profile_id = '${ID.member}'`) === "0-|true");
  check("blood: set_blood_type logged for the member", logCount(ID.member, "set_blood_type") === 1);
  await shot(page, "blood-set");

  await click(page, "button", "^Değiştir$");
  await page.select("#profile-blood-type", "A+");
  await submitFormOf(page, "#profile-blood-type");
  check("blood: changed to 'A Rh+'", !!(await hasText(page, /Kan grubun: A Rh\+/)) && sql(`select blood_type from member_health where profile_id = '${ID.member}'`) === "A+");

  await click(page, "button", "^Rızamı geri al$");
  await dialogVisible(page, "alertdialog");
  await click(page, "[role=alertdialog] button", "^Rızamı geri al$");
  check("blood: withdraw confirm closes", !!(await dialogGone(page, "alertdialog")));
  await until(page, () => !document.body.innerText.includes("Kan grubun: "), null);
  check("blood: withdrawn -> type gone, form back", !(await bodyText(page)).includes("Kan grubun: ") && !!(await find(page, "#profile-blood-type")));
  check("blood: nothing stored, withdraw logged", sql(`select count(*) from member_health where profile_id = '${ID.member}' and blood_type is not null`) === "0" && logCount(ID.member, "withdraw_blood_type") === 1);
});
clean();

// 3 plates (member)
await scenario("plates", "member@test.local", async (page) => {
  await go(page, "/account");
  await click(page, "button", "Motosiklet ekle");
  await dialogVisible(page);
  await typeInto(await find(page, "[role=dialog] input[name=brand]"), "Yamaha");
  await typeInto(await find(page, "[role=dialog] input[name=model]"), "MT-07");
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "689");
  const plateInput = await find(page, "[role=dialog] input[placeholder='34 ABC 123']");
  await typeInto(plateInput, "34abc123");
  await page.keyboard.press("Tab"); // blur tidies the plate
  const tidy = await plateInput.evaluate((i) => i.value);
  check("plates: '34abc123' is tidied to '34 ABC 123' on blur", tidy === "34 ABC 123", tidy);
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check("plates: dialog closes", !!(await dialogGone(page)));
  check("plates: plate on the bike row", !!(await hasText(page, /Yamaha MT-07 · 689 cc · 34 ABC 123/)));
  await go(page, "/members?q=Test");
  const c1 = await memberCard(page, "Test Üye");
  check("plates: plate shown in /members", !!c1 && /Yamaha MT-07 · 689 cc · 34 ABC 123/.test(c1), JSON.stringify(c1));

  await go(page, "/account");
  const sw = (await switchFor(page, "Plakalarımı göster")).asElement();
  check("plates: 'Plakalarımı göster' starts on", (await sw.evaluate((s) => s.getAttribute("aria-checked"))) === "true");
  await sw.click();
  check("plates: switch now off", (await sw.evaluate((s) => s.getAttribute("aria-checked"))) === "false");
  await submitFormOf(page, "[role=switch]");
  await hasText(page, /Kaydedildi\./);
  await sleep(500);
  check("plates: stored show_plates = false", sql(`select show_plates from member_details where profile_id = '${ID.member}'`) === "f");
  await go(page, "/members?q=Test");
  const c2 = await memberCard(page, "Test Üye");
  check("plates: switched off -> plate gone from /members, bike stays", !!c2 && /Yamaha MT-07 · 689 cc/.test(c2) && !/34 ABC 123/.test(c2), JSON.stringify(c2));
  await shot(page, "plates-hidden");
});
clean();

// Plants for the staff view: member has two contacts, A+ with consent and a hidden plate; second has none.
sql(`insert into member_emergency_contacts (profile_id, position, name, relationship, phone) values
  ('${ID.member}', 1, 'Ayşe Yılmaz', 'spouse_partner', '+905321234567'),
  ('${ID.member}', 2, 'Mehmet Demir', 'parent', '+905339876543')`);
sql(`insert into member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version) values ('${ID.member}', 'A+', true, now(), 'e2e')`);
sql(`insert into member_motorcycles (profile_id, brand, model, cc, plate) values ('${ID.member}', 'Yamaha', 'MT-07', 689, '34 ABC 123')`);
sql(`update member_details set show_plates = false where profile_id = '${ID.member}'`);
sql(`update profiles set district = 'Kadıköy', side = 'asian' where id = '${ID.member}'`); // members-e2e moves them

// 4 plain member sees nothing of it
await scenario("plain", "second@test.local", async (page) => {
  const cards = (p) => p.evaluate(() => document.querySelectorAll("li[data-skeleton-result=members-row]").length);
  await go(page, "/members?q=Test%20%C3%9Cye");
  const card = await memberCard(page, "Test Üye");
  check("plain: the 'Test Üye' card is rendered with its bike line", !!card && /Yamaha MT-07 · 689 cc/.test(card), JSON.stringify(card));
  check("plain: hidden plate and 'Acil durum' button/badge absent from that card", !!card && !card.includes("34 ABC 123") && !/Acil durum|Acil kişi/.test(card));
  await go(page, "/members");
  const all = await total(page);
  const n = await cards(page);
  const text = await bodyText(page);
  check("plain: unfiltered list rendered", n > 0 && !!all, `${n} cards, ${all}`);
  check("plain: no 'Acil durum' buttons, badges or safety filters", !/Acil durum|Acil kişi/.test(text) && !(await find(page, "[aria-label='Kan grubu']")) && !(await find(page, "[role=group]", "Güvenlik filtreleri")));
  await go(page, "/members?blood=A%2B&noContact=1");
  const filtered = await total(page);
  check("plain: ?blood=A+&noContact=1 ignored (normal list, same total, cards rendered)", filtered === all && (await cards(page)) === n && n > 0, `${all} vs ${filtered}`);
  check("plain: filter params left no 'filter_blood_type' log row", logCount(ID.second, "filter_blood_type") === 0 && Number(sql(`select count(*) from safety_access_log where actor_id = '${ID.second}'`)) === 0);
});


// 5 staff (admin holds members.safety)
await scenario("staff", "admin@test.local", async (page) => {
  await go(page, "/members");
  const all = await total(page);
  const text = await bodyText(page);
  check("staff: safety filters shown (group, blood select, no-contact chip)", !!(await find(page, "[aria-label='Kan grubu']")) && !!(await find(page, "[role=group]", "Güvenlik filtreleri")) && text.includes("Acil kişisi yok"), all);
  await go(page, "/members?q=%C3%87elik"); // search: with other active members the fixtures may not be on page one
  const secondCard = await memberCard(page, "Çelik Fixture");
  check("staff: member without contacts gets the 'Acil kişi yok' badge", !!secondCard && /Acil kişi yok/.test(secondCard));
  await go(page, "/members?q=Test%20%C3%9Cye");
  const memberCardText = await memberCard(page, "Test Üye");
  check("staff: member with contacts has no badge and (plate hidden) no plate in the card line", !!memberCardText && !/Acil kişi yok/.test(memberCardText) && /Acil durum/.test(memberCardText) && !/34 ABC 123/.test(memberCardText), JSON.stringify(memberCardText));

  const expectedBlood = sql(`select count(*) from member_health h join profiles p on p.id = h.profile_id where h.blood_type = 'A+' and h.consent_blood_type and p.status = 'active'`);
  await go(page, "/members");
  await page.select("[aria-label='Kan grubu']", "A+");
  await click(page, "button[type=submit]", "Uygula");
  await until(page, () => location.search.includes("blood=A%2B"), null);
  await sleep(600);
  const byBlood = await total(page);
  const names = await page.evaluate(() => [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")].map((p) => p.textContent));
  check("staff: blood-type filter A Rh+ narrows the list to the member", byBlood === `${expectedBlood} üye` && expectedBlood === "1" && byBlood !== all && names.length === 1 && names[0] === "Test Üye", `${all} -> ${byBlood} ${JSON.stringify(names)}`);
  check("staff: filter logged with the blood type as detail", logCount(ID.admin, "filter_blood_type") >= 1 && sql(`select detail from safety_access_log where actor_id = '${ID.admin}' and action = 'filter_blood_type' order by id desc limit 1`) === "A+");

  await go(page, "/members?noContact=1");
  const noContact = await total(page);
  const ncNames = await page.evaluate(() => [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")].map((p) => p.textContent));
  check("staff: 'no contact' filter lists only members without contacts", noContact !== all && ncNames.length > 0 && !ncNames.includes("Test Üye"), `${all} -> ${noContact} ${JSON.stringify(ncNames)}`);

  // In-browser search and chip as a holder: no server request (the "no contact" link must not prefetch per key),
  // then the blood filter (a server navigation) keeps q and side, filters by all three and logs once per navigation.
  await go(page, "/members");
  const server = watchServer(page, BASE);
  const box = await find(page, "input[type=search]");
  await box.type("test", { delay: 0 });
  await click(page, "[data-skeleton-result=members-chips] button", "^Anadolu");
  await until(page, () => location.search === "?q=test&side=asian", null);
  await sleep(1500); // a prefetch would have fired by now
  check("staff: typing and a chip make no document or RSC request (no prefetch per keystroke)", server.count() === 0, server.list().join(" | "));
  const logsBefore = logCount(ID.admin, "filter_blood_type");
  await page.select("[aria-label='Kan grubu']", "A+");
  await click(page, "button[type=submit]", "Uygula");
  await until(page, () => location.search.includes("blood=A%2B"), null);
  await sleep(600);
  const params1 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  const after1 = await listState(page);
  check("staff: blood filter after a browser search keeps q and side", params1.q === "test" && params1.side === "asian" && params1.blood === "A+" && !("page" in params1), JSON.stringify(params1));
  check("staff: ... and filters by search, side and blood type (box and chip kept)", after1.total === "1 üye" && after1.names.join() === "Test Üye" && after1.value === "test" && after1.chip === "Anadolu", JSON.stringify(after1));
  check("staff: one filter_blood_type row for that navigation", logCount(ID.admin, "filter_blood_type") === logsBefore + 1, `${logsBefore} -> ${logCount(ID.admin, "filter_blood_type")}`);
  await page.select("[aria-label='Kan grubu']", "0+");
  await click(page, "button[type=submit]", "Uygula");
  await until(page, () => location.search.includes("blood=0%2B"), null);
  await sleep(600);
  const params2 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  check("staff: a second blood filter keeps q and side, writes one more row", params2.q === "test" && params2.side === "asian" && (await listState(page)).total === "0 üye" && logCount(ID.admin, "filter_blood_type") === logsBefore + 2, `${JSON.stringify(params2)} ${logCount(ID.admin, "filter_blood_type")}`);
  // The "no contact" chip (a server navigation too) also keeps the browser's search and side.
  await go(page, "/members");
  await (await find(page, "input[type=search]")).type("çel", { delay: 0 });
  await until(page, () => location.search === "?q=%C3%A7el", null);
  await click(page, "[role=group] a", "Acil kişisi yok");
  await until(page, () => location.search.includes("noContact=1"), null);
  await sleep(600);
  const params3 = await page.evaluate(() => Object.fromEntries(new URLSearchParams(location.search)));
  check("staff: 'no contact' chip after a browser search keeps q, lists the member without contacts", params3.q === "çel" && (await listState(page)).names.join() === "Çelik Fixture", `${JSON.stringify(params3)} ${JSON.stringify(await listState(page))}`);

  await go(page, "/members?noContact=1&q=Test%20%C3%9Cye");
  check("staff: 'no contact' + search excludes the member who has contacts", (await total(page)) === "0 üye", String(await total(page)));
  await go(page, "/members?noContact=1&q=%C3%87elik");
  check("staff: 'no contact' + search finds the member without contacts", (await total(page)) === "1 üye", String(await total(page)));
  await go(page, "/members?q=Test%20%C3%9Cye");
  const before = logCount(ID.admin, "view_card", ID.member);
  await click(page, "button", "Test Üye için acil durum bilgileri");
  await dialogVisible(page);
  await hasText(page, /Ayşe Yılmaz/);
  const dlg = await page.evaluate(() => {
    const d = [...document.querySelectorAll("[role=dialog]")].find((e) => e.getBoundingClientRect().width > 0);
    return {
      text: d.innerText,
      tel: [...d.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h.startsWith("tel:")),
      wa: [...d.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h.includes("api.whatsapp.com")),
    };
  });
  check("card: both contacts with name and phone", /Ayşe Yılmaz/.test(dlg.text) && /Mehmet Demir/.test(dlg.text) && /Eş \/ partner/.test(dlg.text), dlg.text.replace(/\n/g, " | "));
  check("card: tel: and api.whatsapp.com links per contact", dlg.tel.length === 2 && dlg.wa.length === 2 && dlg.tel[0] === "tel:+905321234567" && dlg.wa.every((h) => h.startsWith("https://api.whatsapp.com/send")), JSON.stringify([dlg.tel, dlg.wa]));
  check("card: blood type shown as 'A Rh+'", /Kan grubu\s*A Rh\+/.test(dlg.text));
  check("card: plate shown although the member hides it", /Yamaha MT-07 · 689 cc · 34 ABC 123/.test(dlg.text));
  check("card: opening it logged view_card for the member", logCount(ID.admin, "view_card", ID.member) === before + 1);
  await shot(page, "card");
  await click(page, "[role=dialog] button", "^Kapat$");
  check("card: closes", !!(await dialogGone(page)));
});
clean();

// 6 inactive member: delete and withdraw only
sql(`insert into member_emergency_contacts (profile_id, position, name, relationship, phone) values ('${ID.inactive}', 1, 'Eski Kişi', 'friend', '+905321234567')`);
sql(`insert into member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version) values ('${ID.inactive}', 'B-', true, now(), 'e2e')`);
await scenario("inactive", "inactive@test.local", async (page) => {
  await go(page, "/account");
  const text = await sectionText(page);
  check("inactive: contact and blood type listed", /Eski Kişi/.test(text) && /Kan grubun: B Rh−/.test(text), text.replace(/\n/g, " | "));
  check("inactive: no add, edit or change controls", !(await find(page, "#emergency button", "Kişi ekle")) && !(await find(page, "#emergency button", "kişisini düzenle")) && !(await find(page, "#emergency button", "^Değiştir$")));
  await shot(page, "inactive");
  await click(page, "#emergency button", "Eski Kişi kişisini sil");
  await dialogVisible(page, "alertdialog");
  await click(page, "[role=alertdialog] button", "^Sil$");
  await dialogGone(page, "alertdialog");
  await until(page, () => !document.body.innerText.includes("Eski Kişi"), null);
  check("inactive: contact deleted", contactCount(ID.inactive) === 0);
  await click(page, "#emergency button", "^Rızamı geri al$");
  await dialogVisible(page, "alertdialog");
  await click(page, "[role=alertdialog] button", "^Rızamı geri al$");
  await dialogGone(page, "alertdialog");
  await until(page, () => !document.body.innerText.includes("Kan grubun: "), null);
  check("inactive: consent withdrawn, type erased", sql(`select count(*) from member_health where profile_id = '${ID.inactive}' and blood_type is not null`) === "0");
});
clean();

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
