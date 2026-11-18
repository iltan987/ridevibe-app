// Ön alım (probation) + staff notes E2E (PASS/FAIL lines, exit code != 0 on failure). Needs a production server on
// :3123 (pnpm build && pnpm start -p 3123) and email sign-in enabled locally (docs/learnings/testing.md, "Testing as a
// signed-in user locally") with these fixtures:
//   admin@test.local      active, admin role (holds members.notes implicitly), "Test Admin"
//   probation@test.local  status probation, "Ön Alım Fixture", Üsküdar + asian, status_changed_at ~5 days ago
//   member@test.local     active, "Test Üye"   +   second@test.local  active, "Çelik Fixture"
//   (other active profiles are fine: the script reads the active total from the DB)
// Fixture recipe (local stack only; password test-password-123; SECRET_KEY from `pnpm exec supabase status -o env`):
//   1. for u in admin member second probation; do curl -sf -o /dev/null -X POST \
//        http://127.0.0.1:54321/auth/v1/admin/users -H "apikey: $SECRET_KEY" -H "Content-Type: application/json" \
//        -d "{\"email\":\"$u@test.local\",\"password\":\"test-password-123\",\"email_confirm\":true}"; done
//   2. docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 <<'SQL'
//        update profiles set status = 'active' where id in (select id from auth.users where email in
//          ('admin@test.local', 'member@test.local', 'second@test.local'));
//        update profiles set status = 'probation', status_changed_at = now() - interval '5 days'
//          where id = (select id from auth.users where email = 'probation@test.local');
//        update profiles set role_id = (select id from roles where is_admin)
//          where id = (select id from auth.users where email = 'admin@test.local');
//        update profiles p set full_name = v.n, district = v.d, side = v.s::istanbul_side
//          from auth.users u, (values ('admin@test.local', 'Test Admin', null, null),
//            ('member@test.local', 'Test Üye', 'Kadıköy', 'asian'), ('second@test.local', 'Çelik Fixture', 'Beşiktaş', 'european'),
//            ('probation@test.local', 'Ön Alım Fixture', 'Üsküdar', 'asian')) v(e, n, d, s)
//          where u.email = v.e and p.id = u.id;
//      SQL
//   Cleanup: delete from applications where email like '%@test.local'; delete from auth.users where email like '%@test.local';
// The script resets the probation fixture (status, status_changed_at) and deletes its notes through `docker exec psql`
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

const PROBATION_ID = sql("select id from auth.users where email = 'probation@test.local'");
const FIXTURE_NAMES = ["Test Üye", "Çelik Fixture", "Test Admin"];
function reset() {
  sql(`delete from member_notes where profile_id = '${PROBATION_ID}'`);
  sql(
    `update profiles set status = 'probation', status_changed_at = now() - interval '5 days' where id = '${PROBATION_ID}'`,
  );
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
const hasText = (page, re) =>
  until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags], 8000);
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
/** The visible admin row of the fixture, as text (the row is a li). */
const fixtureRow = (page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll("li[data-skeleton-result=admin-row]")].find(
        (li) => li.getBoundingClientRect().width > 0 && li.textContent.includes("Ön Alım Fixture"),
      )?.innerText ?? null,
  );
/** Cookie header of the signed-in page, for fetching with plain fetch. */
const cookieHeader = async (page) => (await page.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ");

async function probationScenario(width, height) {
  const label = `${width}px`;
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  await signIn(page, "probation@test.local", BASE);
  try {
    // /members: crowd card, no names.
    await go(page, "/members");
    const activeTotal = Number(sql("select count(*) from profiles where status = 'active'"));
    const asian = Number(sql("select count(*) from profiles where status = 'active' and side = 'asian'"));
    const european = Number(sql("select count(*) from profiles where status = 'active' and side = 'european'"));
    const text = await bodyText(page);
    const summary = `Kulüpte ${activeTotal} üye var · Anadolu ${asian} · Avrupa ${european}`;
    check(`${label} /members shows the crowd summary`, text.includes(summary), summary);
    check(
      `${label} /members says the list opens with full membership`,
      text.includes("Üye listesi tam üyeliğe geçince açılır."),
    );
    const html = await page.content();
    const leaked = FIXTURE_NAMES.filter((n) => html.includes(n));
    check(`${label} /members HTML holds no fixture full name`, leaked.length === 0, leaked.join(", "));
    const grid = await page.evaluate(() => {
      const ul = document.querySelector("ul[aria-hidden=true]");
      return { count: ul?.children.length ?? 0, sr: document.querySelector("p.sr-only")?.textContent ?? "" };
    });
    check(
      `${label} initials grid is aria-hidden with one chip per member`,
      grid.count === activeTotal,
      `${grid.count}/${activeTotal}`,
    );
    check(`${label} sr-only total sentence`, grid.sr === `Kulüpte ${activeTotal} üye var.`, grid.sr);
    check(
      `${label} no member search box or cards`,
      (await page.$$("li[data-skeleton-result=members-row]")).length === 0,
    );
    await page.screenshot({ path: path.join(DIR, `probation-members-${width}.png`), fullPage: true });

    // RSC payload of the same page: no fixture full name either.
    const rsc = await fetch(`${BASE}/members`, {
      headers: { RSC: "1", Cookie: await cookieHeader(page), "Accept-Language": "tr" },
    });
    const rscText = await rsc.text();
    check(`${label} RSC payload fetched`, rsc.ok && rscText.length > 500, `${rsc.status}, ${rscText.length} bytes`);
    const rscLeaked = FIXTURE_NAMES.filter((n) => rscText.includes(n));
    check(`${label} RSC payload holds no fixture full name`, rscLeaked.length === 0, rscLeaked.join(", "));
    check(`${label} RSC payload carries the overview`, rscText.includes(String(activeTotal)));

    // /account: probation card + profile sections + badge.
    await go(page, "/account");
    const acc = await bodyText(page);
    check(`${label} /account probation title`, acc.includes("Ön alım dönemindesin"));
    check(
      `${label} /account probation body`,
      acc.includes("Kulüp seninle tanışıyor; tam üyeliğe geçtiğinde üye listesi açılır."),
    );
    check(`${label} /account status badge "Ön alım"`, /Ön alım/.test(acc));
    check(
      `${label} /account keeps the profile sections`,
      /Acil durum/.test(acc) && /Motosiklet/.test(acc),
      "emergency + motorcycles",
    );
    await page.screenshot({ path: path.join(DIR, `probation-account-${width}.png`), fullPage: true });

    // /apply: already a member; no Başvur in the nav.
    await go(page, "/apply");
    check(`${label} /apply shows "Zaten üyesin"`, (await bodyText(page)).includes("Zaten üyesin"));
    const navApply = await page.evaluate(
      () =>
        [...document.querySelectorAll("nav a, header a")].filter(
          (a) => a.getBoundingClientRect().width > 0 && /^\s*Başvur\s*$/.test(a.textContent),
        ).length,
    );
    check(`${label} no "Başvur" in the nav`, navApply === 0, `${navApply} visible`);
  } finally {
    await ctx.close();
  }
}

async function adminScenario(width, height) {
  const label = `${width}px`;
  reset();
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, { width, height });
  await signIn(page, "admin@test.local", BASE);
  try {
    await go(page, "/admin/members?status=probation&q=" + encodeURIComponent("Ön Alım Fixture"));
    const tabs = await page.evaluate(() => document.body.innerText);
    check(
      `${label} tabs Bekleyen / Ön alım / Aktif / Pasif`,
      ["Ön alım", "Aktif", "Pasif"].every((s) => tabs.includes(s)) && /Onay bekleyen|Bekleyen/.test(tabs),
    );
    let row = await fixtureRow(page);
    check(`${label} Ön alım tab lists the fixture`, row !== null);
    check(`${label} row shows "Ön alım · 5 gün"`, row?.includes("Ön alım · 5 gün") ?? false, JSON.stringify(row));
    check(
      `${label} row buttons: Tam üye yap + Pasifleştir`,
      !!row && row.includes("Tam üye yap") && row.includes("Pasifleştir") && !row.includes("Ön alıma al"),
    );
    await page.screenshot({ path: path.join(DIR, `probation-admin-${width}.png`), fullPage: true });

    // Notes: add, shown with author, count, delete.
    const rowSel = async () => {
      const li = await page.evaluateHandle(
        () =>
          [...document.querySelectorAll("li[data-skeleton-result=admin-row]")].find(
            (l) => l.getBoundingClientRect().width > 0 && l.textContent.includes("Ön Alım Fixture"),
          ) ?? null,
      );
      return li.asElement();
    };
    const li = await rowSel();
    const notesBtn = await li.evaluateHandle(
      (l) => [...l.querySelectorAll("button")].find((b) => /^\s*Notlar/.test(b.textContent)) ?? null,
    );
    check(`${label} "Notlar" button on the row`, notesBtn.asElement() !== null);
    await notesBtn.asElement().evaluate((b) => b.scrollIntoView({ block: "center" }));
    await notesBtn.asElement().click();
    check(`${label} notes dialog opens (empty)`, !!(await hasText(page, /Henüz not yok\./)));
    const area = await find(page, "textarea");
    await area.focus();
    await area.type("E2E notu: ilk görüşme iyi geçti.");
    check(
      `${label} "Not ekle" enabled once text is typed`,
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button[type=submit]")].find(
          (x) => x.getBoundingClientRect().width > 0 && /Not ekle/.test(x.textContent),
        );
        return !!b && !b.disabled;
      }),
    );
    await click(page, "button[type=submit]", "Not ekle");
    const shown = await hasText(page, /E2E notu: ilk görüşme iyi geçti\./);
    check(`${label} note appears in the dialog`, !!shown);
    const dlg = await page.evaluate(
      () =>
        [...document.querySelectorAll("[role=dialog]")].find((d) => d.getBoundingClientRect().width > 0)?.innerText ??
        "",
    );
    check(
      `${label} note shows the author "Test Admin"`,
      dlg.includes("Test Admin"),
      dlg.replace(/\n/g, " | ").slice(0, 160),
    );
    check(
      `${label} note stored in the DB`,
      sql(`select count(*) from member_notes where profile_id = '${PROBATION_ID}'`) === "1",
    );
    await page.screenshot({ path: path.join(DIR, `probation-notes-${width}.png`), fullPage: true });
    // Delete with confirm.
    await click(page, "[role=dialog] button", "^\\s*Sil\\s*$");
    check(`${label} delete asks for confirmation`, !!(await hasText(page, /Bu not silinsin mi\?/)));
    await click(page, "[role=dialog] button", "Evet, sil");
    check(
      `${label} note gone after confirm`,
      !!(await until(page, () => document.body.innerText.includes("Henüz not yok.") || null)),
    );
    check(
      `${label} note deleted in the DB`,
      sql(`select count(*) from member_notes where profile_id = '${PROBATION_ID}'`) === "0",
    );
    // Add again so the list shows a count after reload.
    const area2 = await find(page, "textarea");
    await area2.focus();
    await area2.type("İkinci not.");
    await click(page, "button[type=submit]", "Not ekle");
    await hasText(page, /İkinci not\./);
    await click(page, "[role=dialog] button", "^\\s*Kapat\\s*$");
    await sleep(500);
    await go(page, "/admin/members?status=probation&q=" + encodeURIComponent("Ön Alım Fixture"));
    row = await fixtureRow(page);
    check(`${label} button shows "Notlar (1)" after reload`, row?.includes("Notlar (1)") ?? false, JSON.stringify(row));

    // Promote: moves to Aktif.
    check(`${label} promote click`, await click(page, "li[data-skeleton-result=admin-row] button", "Tam üye yap"));
    const gone = await until(page, () =>
      [...document.querySelectorAll("li[data-skeleton-result=admin-row]")].every(
        (l) => l.getBoundingClientRect().width === 0 || !l.textContent.includes("Ön Alım Fixture"),
      ),
    );
    check(`${label} fixture leaves the Ön alım tab`, !!gone);
    check(`${label} DB status is active`, sql(`select status from profiles where id = '${PROBATION_ID}'`) === "active");
    await go(page, "/admin/members?status=active&q=" + encodeURIComponent("Ön Alım Fixture"));
    row = await fixtureRow(page);
    check(
      `${label} fixture listed under Aktif without the days badge`,
      row !== null && !row.includes("Ön alım ·"),
      JSON.stringify(row),
    );
  } finally {
    await ctx.close();
    reset();
  }
}

try {
  reset();
  await probationScenario(390, 844);
  await probationScenario(1280, 900);
  await adminScenario(390, 844);
  await adminScenario(1280, 900);
} catch (e) {
  fails++;
  console.log("FAIL unexpected error —", e.stack ?? e);
} finally {
  reset();
  await browser.close();
}
console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
