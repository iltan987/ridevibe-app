// Self-service account deletion E2E (PASS/FAIL lines, exit code != 0 on failure). Needs a production server on :3123
// (pnpm build && pnpm start -p 3123), email sign-in enabled locally (docs/learnings/testing.md, "Testing as a
// signed-in user locally"; the last part signs in through the real /auth/callback with a magic link from Mailpit)
// and these fixtures (recipe in scripts/e2e/safety-e2e.mjs):
//   admin@test.local   active, admin role
//   member@test.local  active, "Test Üye", no application
// Flow: the admin sees the member; the last-admin guard (only when admin@ is the only active admin); the member deletes
// on /account (double click on confirm) → the done dialog with the purge date stays up (no re-render/redirect) →
// "Ana sayfaya dön" signs out on "/" → a second tab follows to signed-out; the admin no longer sees the member on
// /admin/members and /members; the member signs in again with next=/en/members → /en/account recovery card (English)
// → Restore → "Active member", visible to the admin again.
// The member (and the admin) end active: `finally` restores them through `docker exec psql` (DB_CONTAINER, local only)
// if a step failed midway; the same restore runs before the flow.
// Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123), OUT_DIR (screenshots, default: OS temp
// dir), DB_CONTAINER (default supabase_db_ridevibe).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launch, newPage, signIn, signInViaCallback } from "./e2e-lib.mjs";

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

const ID = Object.fromEntries(["admin", "member"].map((n) => [n, sql(`select id from auth.users where email = '${n}@test.local'`)]));
if (!ID.admin || !ID.member) throw new Error("fixtures admin@test.local / member@test.local missing (see the header)");
const MEMBER_EMAIL = "member@test.local";
const MEMBER_NAME = "Test Üye";

/** Puts both fixtures back to their status before a deletion request (only rows this script can have changed). */
function restore() {
  sql(`update profiles set status = status_before_deletion, deletion_requested_at = null, status_before_deletion = null
       where id in ('${ID.admin}', '${ID.member}') and status = 'deleting'`);
}
const memberRow = () => sql(`select status || '|' || coalesce(status_before_deletion::text, '') || '|' ||
  coalesce(to_char(deletion_requested_at, 'YYYY-MM-DD'), '') from profiles where id = '${ID.member}'`);

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
const hasText = (page, re, ms = 8000) =>
  until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags], ms);
/** Inner text of the visible alert dialog, or null. */
const dialogText = (page) =>
  page.evaluate(() => [...document.querySelectorAll("[role=alertdialog]")].find((e) => e.getBoundingClientRect().width > 0)?.innerText ?? null);
async function find(page, selector, text) {
  const h = await page.evaluateHandle(
    (selector, text) =>
      [...document.querySelectorAll(selector)].find((e) => e.getBoundingClientRect().width > 0 && e.textContent.trim() === text) ?? null,
    selector,
    text,
  );
  return h.asElement();
}
async function click(page, selector, text) {
  const el = await find(page, selector, text);
  if (!el) return false;
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
  return true;
}
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `deletion-${name}.png`), fullPage: true });
/** Purge date as the UI prints it (request time + 14 days, long date, Istanbul time). */
const purgeDate = (locale) => {
  const requested = sql(`select extract(epoch from deletion_requested_at) from profiles where id = '${ID.member}'`);
  const date = new Date(Number(requested) * 1000 + 14 * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "Europe/Istanbul" }).format(date);
};
const authCookies = async (page) => (await page.cookies(BASE)).filter((c) => c.name.startsWith("sb-127-auth-token")).length;

/** Whether the admin's /admin/members (all tabs are in the payload) and /members show the member. */
async function adminSees(page) {
  // Without `q`: the search box would echo the email into the page.
  await go(page, "/admin/members");
  const staff = (await page.content()).includes(MEMBER_EMAIL);
  await go(page, `/admin/members?status=active&q=${encodeURIComponent("test üye")}`);
  const staffRow = Boolean(await hasText(page, new RegExp(MEMBER_NAME), 1500));
  await go(page, "/members");
  const directory = (await page.content()).includes(MEMBER_NAME);
  return { staff, staffRow, directory };
}

restore();
const browser = await launch();
try {
  const adminCtx = await browser.createBrowserContext();
  const admin = await newPage(adminCtx);
  await signIn(admin, "admin@test.local", BASE);

  // 0. Positive control: the admin sees the member everywhere before the deletion.
  {
    const s = await adminSees(admin);
    check("before: admin sees the member on /admin/members and /members", s.staff && s.staffRow && s.directory, JSON.stringify(s));
  }

  // 1. Last-admin guard (only meaningful when admin@ is the only active admin).
  const admins = Number(sql("select count(*) from profiles p join roles r on r.id = p.role_id where r.is_admin and p.status = 'active'"));
  if (admins === 1) {
    await go(admin, "/account");
    await click(admin, "button", "Hesabımı sil");
    await until(admin, () => [...document.querySelectorAll("[role=alertdialog]")].some((e) => e.getBoundingClientRect().width > 0));
    await click(admin, "[role=alertdialog] button", "Hesabımı sil");
    const msg = await hasText(admin, /Kulübün tek yöneticisisin/);
    const status = sql(`select status from profiles where id = '${ID.admin}'`);
    check("last admin: dialog says to hand over the admin role, status unchanged", Boolean(msg) && status === "active", status);
    await click(admin, "[role=alertdialog] button", "Vazgeç");
    const closed = await until(admin, () => ![...document.querySelectorAll("[role=alertdialog]")].some((e) => e.getBoundingClientRect().width > 0));
    check("last admin: Vazgeç closes the dialog", Boolean(closed));
  } else {
    console.log(`SKIP last admin: ${admins} active admins`);
  }

  // 2. The member deletes the account; a second tab of the same browser is open on /members.
  const memberCtx = await browser.createBrowserContext();
  const tabB = await newPage(memberCtx);
  await signIn(tabB, MEMBER_EMAIL, BASE);
  await go(tabB, "/members");
  const tabA = await newPage(memberCtx);
  await go(tabA, "/account");
  await tabA.bringToFront();
  check("member: delete card on /account", await click(tabA, "button", "Hesabımı sil"));
  await until(tabA, () => [...document.querySelectorAll("[role=alertdialog]")].some((e) => e.getBoundingClientRect().width > 0));
  const confirmText = (await dialogText(tabA)) ?? "";
  check(
    "member: dialog lists deleted, kept, grace and club lines (no inactive line)",
    /Silinecekler:/.test(confirmText) && /Kalanlar:/.test(confirmText) && /14 gün/.test(confirmText) && /WhatsApp/.test(confirmText) &&
      !/Üyeliğin sona erdiği/.test(confirmText),
    confirmText.replace(/\s+/g, " ").slice(0, 120),
  );
  await shot(tabA, "confirm");
  // Double click before React can disable the button: both requests must end in the same done state.
  const confirm = await find(tabA, "[role=alertdialog] button", "Hesabımı sil");
  await confirm.evaluate((b) => {
    b.click();
    b.click();
  });
  const done = await hasText(tabA, /Hesabın silinecek/, 10000);
  const row = memberRow();
  check("member: done dialog after confirm; DB status deleting (was active)", Boolean(done) && row.startsWith("deleting|active|"), row);
  const expected = purgeDate("tr");
  check("member: done dialog shows the purge date", ((await dialogText(tabA)) ?? "").includes(expected), expected);
  await sleep(2000);
  const still = (await dialogText(tabA)) ?? "";
  check(
    "member: done dialog still visible ~2 s later, still on /account (no re-render/redirect)",
    /Hesabın silinecek/.test(still) && new URL(tabA.url()).pathname === "/account",
    tabA.url(),
  );
  await shot(tabA, "done");
  await click(tabA, "[role=alertdialog] button", "Ana sayfaya dön");
  const home = await until(tabA, () => location.pathname === "/" && /Giriş Yap/.test(document.body.innerText), null, 10000);
  check("member: 'Ana sayfaya dön' lands on / signed out (no auth cookies)", Boolean(home) && (await authCookies(tabA)) === 0, tabA.url());

  // 3. The other tab follows (cross-tab AuthSync → refresh → signed out → sign-in page).
  await tabB.bringToFront();
  const followed = await until(tabB, () => location.pathname.startsWith("/sign-in"), null, 10000);
  check("member: second tab refreshes to signed-out (/sign-in)", Boolean(followed), tabB.url());

  // 4. The admin no longer sees the member anywhere.
  {
    const s = await adminSees(admin);
    check("deleting: hidden from /admin/members (not in the payload)", !s.staff && !s.staffRow, JSON.stringify(s));
    check("deleting: hidden from /members", !s.directory, JSON.stringify(s));
  }

  // 5. Signing in again (real callback) with next=/en/members lands on the English recovery card.
  await tabB.close();
  const tabC = await newPage(memberCtx);
  const landed = await signInViaCallback(tabC, MEMBER_EMAIL, "/en/members", BASE);
  check("recovery: callback with next=/en/members lands on /en/account", new URL(landed).pathname === "/en/account", landed);
  await sleep(400);
  const recovery = await hasText(tabC, /Your account will be deleted/);
  const body = await tabC.evaluate(() => document.body.innerText);
  check(
    "recovery: English card with date, Restore and Continue deleting, nothing else of the account page",
    Boolean(recovery) && body.includes(purgeDate("en")) && /Restore my account/.test(body) && /Continue deleting/.test(body) &&
      !/Delete my account/.test(body),
  );
  await shot(tabC, "recovery");
  await click(tabC, "button", "Restore my account");
  const restored = await hasText(tabC, /Active member/, 10000);
  check("recovery: Restore shows 'Active member'; DB status active, columns cleared", Boolean(restored) && memberRow() === "active||", memberRow());
  check("recovery: still on /en/account", new URL(tabC.url()).pathname === "/en/account", tabC.url());

  // 6. Visible to the admin again.
  {
    const s = await adminSees(admin);
    check("restored: admin sees the member again", s.staff && s.staffRow && s.directory, JSON.stringify(s));
  }
} catch (e) {
  check("finished without an exception", false, e.stack ?? e.message);
} finally {
  restore();
  await browser.close();
}
check("fixtures end active", memberRow() === "active||" && sql(`select status from profiles where id = '${ID.admin}'`) === "active");
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
