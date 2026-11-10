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
import { launch, newPage, signIn } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) => execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();

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
    const v = await page.evaluate(fn, arg);
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
const hasText = (page, re) => until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags], 8000);
const dialogGone = (page, role = "dialog") =>
  until(page, (r) => ![...document.querySelectorAll(`[role=${r}]`)].some((e) => e.getBoundingClientRect().width > 0), role);
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
    (name) => [...document.querySelectorAll("li[data-skeleton-result=members-row]")].find((li) => li.textContent.includes(name))?.innerText ?? null,
    name,
  );
/** Clicks the nth visible "Kaydet" submit button: 0 location, 1 visibility, 2 photo consent (bike dialogs are closed). */
const saveNth = async (page, n) => {
  const buttons = await page.evaluateHandle(() => [...document.querySelectorAll("button[type=submit]")].filter((b) => b.getBoundingClientRect().width > 0 && b.textContent.trim() === "Kaydet"));
  const el = (await buttons.getProperties()).get(String(n));
  const handle = el?.asElement();
  if (!handle) return false;
  await handle.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await handle.click();
  return true;
};

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
sql(`update member_details set instagram = null, show_instagram = false, show_birthday = false, consent_photos = false, consent_photos_at = null, consent_photos_version = null where profile_id = '${MEMBER_ID}'`);
sql(`update member_details set birth_date = null, show_birthday = false where profile_id = '${NOBIRTH_ID}'`);

// 1 anonymous
{
  const { ctx, page } = await fresh();
  await go(page, "/members");
  const url = page.url();
  check("anonymous /members -> sign-in with next", url.includes("/sign-in") && url.includes("next=%2Fmembers"), url.replace(BASE, ""));
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

// 3 directory as an active member
{
  const { ctx, page } = await fresh("member@test.local");
  await go(page, "/members");
  const text = await bodyText(page);
  const total = await page.evaluate(() => document.querySelector("[data-skeleton-result=members-total] p")?.textContent);
  check("directory: total shown", total === "29 üye", total);
  const rows = await page.evaluate(() => document.querySelectorAll("li[data-skeleton-result=members-row]").length);
  check("directory: first page has 25 cards", rows === 25, String(rows));
  check("directory: pager 'Sonraki' appears with > 25 members", !!(await find(page, "a", "Sonraki")));
  check("directory: side chips with counts", /Tümü\s*29/.test(text) && /Anadolu\s*\d+/.test(text) && /Avrupa\s*\d+/.test(text));
  await shot(page, "directory");

  // pager next
  await click(page, "a", "Sonraki");
  const second = await until(page, () => /cursor=/.test(location.search) && document.querySelectorAll("li[data-skeleton-result=members-row]").length > 0 && [...document.querySelectorAll("li[data-skeleton-result=members-row]")].length <= 4, null);
  check("pager: second page shows the remaining 4 members and a 'first' link", !!second && !!(await find(page, "a", "İlk")), page.url().replace(BASE, ""));

  // search without Turkish letters
  await go(page, "/members");
  const input = await find(page, "input[type=search]");
  await input.type("celik");
  await input.press("Enter");
  await until(page, () => location.search.includes("q=celik"), null);
  await sleep(800);
  const names = await page.evaluate(() => [...document.querySelectorAll("li[data-skeleton-result=members-row] p.font-medium")].map((p) => p.textContent));
  const totalAfter = await page.evaluate(() => document.querySelector("[data-skeleton-result=members-total] p")?.textContent);
  check("search 'celik' finds 'Çelik Fixture' only", names.length === 1 && names[0] === "Çelik Fixture" && totalAfter === "1 üye", JSON.stringify(names) + " " + totalAfter);
  const card = await memberCard(page, "Çelik Fixture");
  check("card shows district, side, bike, birthday and Instagram", !!card && /Beşiktaş · Avrupa/.test(card) && /Honda CB500 · 500 cc/.test(card) && /9 Mart/.test(card) && /@celikfx/.test(card), JSON.stringify(card));
  await shot(page, "search");

  // side chip
  await go(page, "/members");
  await click(page, "nav[data-skeleton-result=members-chips] a", "Avrupa");
  await until(page, () => location.search.includes("side=european"), null);
  await sleep(800);
  const euro = await page.evaluate(() => [...document.querySelectorAll("li[data-skeleton-result=members-row]")].map((li) => li.innerText));
  const chipTotal = await page.evaluate(() => document.querySelector("nav[data-skeleton-result=members-chips] a[aria-current=page]")?.textContent);
  check("side chip 'Avrupa' filters (every card is European, Test Üye absent)", euro.length > 0 && euro.every((c) => /Avrupa/.test(c)) && !euro.some((c) => c.includes("Test Üye")), `${euro.length} cards, chip=${chipTotal}`);
  await ctx.close();
}

// 4 account: location, bikes, toggles, consent
{
  const { ctx, page } = await fresh("member@test.local");
  await go(page, "/account");
  await shot(page, "account");

  // name locked
  const nameInputs = await page.evaluate(() => [...document.querySelectorAll("input")].filter((i) => i.getBoundingClientRect().width > 0 && (/name/i.test(i.name) || i.value === "Test Üye")).map((i) => i.name || i.id));
  const hint = (await bodyText(page)).includes("İsim değişikliği için kulüp ekibine yaz.");
  check("account: no name input, hint shown", nameInputs.filter((n) => !/city|district|brand|model/.test(n)).length === 0 && hint, JSON.stringify(nameInputs));

  // district
  await page.select("#profile-district", "Beşiktaş");
  await saveNth(page, 0);
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
  await until(page, () => [...document.querySelectorAll("[role=dialog]")].some((e) => e.getBoundingClientRect().width > 0), null);
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
  await until(page, () => [...document.querySelectorAll("[role=dialog]")].some((e) => e.getBoundingClientRect().width > 0), null);
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "5");
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check("bike edit: cc=5 rejected with a message, dialog stays open", !!(await hasText(page, /50 ile 3000 arasında bir sayı gir/)) && !!(await find(page, "[role=dialog]")));

  // edit
  await typeInto(await find(page, "[role=dialog] input[name=model]"), "MT-09");
  await typeInto(await find(page, "[role=dialog] input[name=cc]"), "890");
  await click(page, "[role=dialog] button[type=submit]", "Kaydet");
  check("bike edit: dialog closes", !!(await dialogGone(page)));
  check("bike edit: new name shown, old gone", !!(await hasText(page, /Yamaha MT-09 · 890 cc/)) && !(await bodyText(page)).includes("MT-07"));

  // delete
  await click(page, "button", "Yamaha MT-09 · 890 cc motosikletini sil");
  await until(page, () => [...document.querySelectorAll("[role=alertdialog]")].some((e) => e.getBoundingClientRect().width > 0), null);
  await shot(page, "delete-confirm");
  await click(page, "[role=alertdialog] button", "^Sil$");
  check("bike delete: confirm closes", !!(await dialogGone(page, "alertdialog")));
  check("bike delete: list empty message shown", !!(await hasText(page, /Henüz motosiklet eklemedin\./)));
  await go(page, "/members?q=Test");
  const c3 = await memberCard(page, "Test Üye");
  check("bike delete: gone from /members", !!c3 && !/Yamaha/.test(c3), JSON.stringify(c3));

  // 10-bike cap (planted by SQL: the UI path was exercised above)
  sql(`insert into member_motorcycles(profile_id, brand, model) select '${MEMBER_ID}', 'Fixture', 'Bike ' || g from generate_series(1, 10) g`);
  await go(page, "/account");
  const addBtn = await find(page, "button", "Motosiklet ekle");
  const disabled = await addBtn.evaluate((b) => b.disabled);
  check("10 bikes: add button disabled with limit hint", disabled && (await bodyText(page)).includes("En fazla 10 motosiklet ekleyebilirsin."));
  await shot(page, "bike-cap");
  const ten = await page.evaluate(() => document.querySelectorAll("[data-skeleton-result=profile-motorcycles] ul li").length);
  check("10 bikes: all ten listed", ten === 10, String(ten));
  sql(`delete from member_motorcycles where profile_id = '${MEMBER_ID}'`);

  // Instagram + birthday
  await go(page, "/account");
  await typeInto(await find(page, "#profile-instagram"), "https://www.instagram.com/testig/?igsh=abc");
  await (await switchFor(page, "Instagram'ımı")).asElement().click();
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveNth(page, 1);
  check("visibility: save shows 'Kaydedildi.'", !!(await hasText(page, /Kaydedildi\./)));
  const igNow = await page.$eval("#profile-instagram", (i) => i.value);
  check("visibility: input shows the normalised handle right after saving", igNow === "testig", igNow);
  await go(page, "/account");
  const ig = await page.$eval("#profile-instagram", (i) => i.value);
  check("visibility: Instagram URL normalised to handle", ig === "testig", ig);
  await go(page, "/members?q=Test");
  const c4 = await memberCard(page, "Test Üye");
  check("visibility: directory shows @testig and 17 Mayıs", !!c4 && /@testig/.test(c4) && /17 Mayıs/.test(c4), JSON.stringify(c4));

  // switch both off again
  await go(page, "/account");
  await (await switchFor(page, "Instagram'ımı")).asElement().click();
  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveNth(page, 1);
  await hasText(page, /Kaydedildi\./);
  await go(page, "/members?q=Test");
  const c5 = await memberCard(page, "Test Üye");
  check("visibility: switched off -> directory hides Instagram and birthday", !!c5 && !/@testig/.test(c5) && !/Mayıs/.test(c5), JSON.stringify(c5));

  // invalid Instagram
  await go(page, "/account");
  await typeInto(await find(page, "#profile-instagram"), "not valid!");
  await saveNth(page, 1);
  check("visibility: invalid Instagram rejected", !!(await hasText(page, /Geçerli bir Instagram kullanıcı adı/)));

  // photo consent
  await go(page, "/account");
  const before = await bodyText(page);
  check("consent: neutral 'not given' without a date before any choice", before.includes("İzin verilmedi.") && !before.includes("İzin verdin"));
  await (await switchFor(page, "kulüp galerisinde paylaşılmasına")).asElement().click();
  await saveNth(page, 2);
  check("consent: saving shows the date", !!(await hasText(page, /İzin verdin \(\d{1,2} \p{L}+ \d{4}\)\./u)));
  await shot(page, "consent");
  // Saving an unchanged consent is ok but writes nothing (version and timestamp stay together).
  const consentRow = () => sql(`select consent_photos_at || '|' || coalesce(consent_photos_version, '') from member_details where profile_id = '${MEMBER_ID}'`);
  sql(`update member_details set consent_photos_version = 'stale' where profile_id = '${MEMBER_ID}'`);
  const stamped = consentRow();
  await go(page, "/account");
  await saveNth(page, 2);
  check("consent: re-saving unchanged consent shows 'Kaydedildi.' and writes nothing", !!(await hasText(page, /Kaydedildi\./)) && consentRow() === stamped, consentRow());
  // Withdrawing: neutral wording, version written with the change.
  await (await switchFor(page, "kulüp galerisinde paylaşılmasına")).asElement().click();
  await saveNth(page, 2);
  check("consent: withdrawing shows 'İzin verilmedi.' and stores the notice version", !!(await hasText(page, /İzin verilmedi\./)) && !consentRow().endsWith("|stale"), consentRow());
  await ctx.close();
}

// 5 member without a birth date: enters it once, then it is read-only
{
  const { ctx, page } = await fresh("nobirth@test.local");
  await go(page, "/account");
  const sw = (await switchFor(page, "Doğum günümü")).asElement();
  const state = await sw.evaluate((s) => ({ disabled: s.hasAttribute("disabled") || s.getAttribute("aria-disabled") === "true" || s.dataset.disabled !== undefined, checked: s.getAttribute("aria-checked") }));
  check("no birth date: birthday switch disabled and off", state.disabled && state.checked === "false", JSON.stringify(state));
  const text = await bodyText(page);
  check("no birth date: 'save it first' and 'once' hints shown", text.includes("Doğum gününü göstermek için önce doğum tarihini kaydet.") && text.includes("Doğum tarihini bir kez girebilirsin"));
  await shot(page, "no-birthdate");

  const input = await find(page, "#profile-birth-date");
  check("no birth date: date field shown", !!input && (await input.evaluate((i) => i.type)) === "date");
  await click(page, "button", "^Doğum tarihini kaydet$");
  check("birth date: empty is rejected", !!(await hasText(page, /Bu alan zorunlu\./)));
  await setInputValue(page, "#profile-birth-date", "2015-01-01");
  await click(page, "button", "^Doğum tarihini kaydet$");
  check("birth date: under 18 is rejected", !!(await hasText(page, /18 yaşından büyük olmalısın\./)) && sql(`select coalesce(birth_date::text, 'null') from member_details where profile_id = '${NOBIRTH_ID}'`) === "null");

  // Enter in the date field saves the date only (its own form), not the visibility form.
  await setInputValue(page, "#profile-birth-date", "1988-07-04");
  await page.focus("#profile-birth-date");
  await page.keyboard.press("Enter");
  const shown = await hasText(page, /Doğum tarihi\s*4 Temmuz 1988/);
  check("birth date: Enter saves it, shown read-only, field gone", !!shown && !(await find(page, "#profile-birth-date")));
  check("birth date: stored in the DB", sql(`select birth_date from member_details where profile_id = '${NOBIRTH_ID}'`) === "1988-07-04");
  const enabled = await (await switchFor(page, "Doğum günümü")).asElement().evaluate((s) => !s.hasAttribute("disabled") && s.getAttribute("aria-disabled") !== "true" && s.dataset.disabled === undefined);
  check("birth date: birthday switch enabled, 'missing' hint gone", enabled && !(await bodyText(page)).includes("önce doğum tarihini kaydet"));
  await shot(page, "birthdate-saved");

  await (await switchFor(page, "Doğum günümü")).asElement().click();
  await saveNth(page, 1);
  await hasText(page, /Kaydedildi\./);
  await go(page, "/members?q=Tarihsiz");
  const card = await memberCard(page, "Tarihsiz Fixture");
  check("birth date: directory shows the birthday once switched on", !!card && /4 Temmuz/.test(card), JSON.stringify(card));
  await ctx.close();
}

// 6 English
{
  const { ctx, page } = await fresh("member@test.local");
  await go(page, "/en/members");
  const t = await bodyText(page);
  check("English: /en/members renders translated labels", /Members/.test(t) && /Asian side|Anatolian|Asian/.test(t) && !/MISSING_MESSAGE/.test(t));
  await ctx.close();
}

await browser.close();
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
