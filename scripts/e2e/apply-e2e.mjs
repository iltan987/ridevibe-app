// Application form E2E (/apply): four steps, Enter = "Devam", browser back, localStorage draft (steps 1-3 only),
// language switch, deep link to step 4, writing minimum, draft cleared after submit, "Google ile doldur".
// Needs a production server on :3123 (pnpm build && pnpm start -p 3123) and the local Supabase stack (the test
// application is written to the local database). The last check needs email sign-in enabled locally and the fixture
// user pending-noapp@test.local (docs/learnings/testing.md); without them it prints SKIP.
// Test application: apply-e2e@test.local, deleted before and after through `docker exec … psql` (local DB only).
// Env: PUPPETEER_DIR (required), OUT_DIR (screenshots, default: OS temp dir), DB_CONTAINER (default supabase_db_ridevibe).
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { launch, newPage, signIn } from "./e2e-lib.mjs";

const DIR = process.env.OUT_DIR ?? os.tmpdir();
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const DB = process.env.DB_CONTAINER ?? "supabase_db_ridevibe";
const DRAFT_KEY = "rv-apply-draft";
const TEST_EMAIL = "apply-e2e@test.local";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};
const sql = (q) =>
  execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-tA", "-c", q], { encoding: "utf8" }).trim();
const deleteTestApplication = () => sql(`delete from applications where email = '${TEST_EMAIL}'`);
const testApplicationCount = () => Number(sql(`select count(*) from applications where email = '${TEST_EMAIL}'`));

deleteTestApplication();
const browser = await launch();

/** Fresh Turkish context (clean localStorage). */
async function fresh(userAgent) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx);
  if (userAgent) await page.setUserAgent(userAgent);
  return { ctx, page };
}
async function go(page, p) {
  await page.goto(BASE + p, { waitUntil: "networkidle0" });
  await sleep(500); // hydration
}
/** Polls until fn (run in the page) returns truthy. Returns the value or null on timeout. */
async function until(page, fn, arg, ms = 8000) {
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
const bodyText = (page) => page.evaluate(() => document.body.innerText);
const hasText = (page, re) =>
  until(page, ([src, flags]) => new RegExp(src, flags).test(document.body.innerText), [re.source, re.flags]);
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
/** Types into the visible input/textarea (replacing its content). */
async function typeInto(page, selector, value) {
  const el = await find(page, selector);
  if (!el) throw new Error(`no visible ${selector}`);
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.focus();
  await el.evaluate((i) => i.select());
  await el.press("Backspace");
  await el.type(value);
}
/** Clicks the visible option label (radio or chip) with exactly this text inside the field. */
async function pick(page, field, text) {
  const h = await page.evaluateHandle(
    (field, text) =>
      [...document.querySelectorAll(`[data-field="${field}"] label`)].find(
        (l) => l.getBoundingClientRect().width > 0 && l.textContent.trim() === text,
      ) ?? null,
    field,
    text,
  );
  const el = h.asElement();
  if (!el) throw new Error(`no option "${text}" in ${field}`);
  await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
  await el.click();
  await sleep(80);
}
/** Sets a controlled input's value the way React notices (typing into type=date depends on the browser locale). */
async function setInputValue(page, selector, value) {
  await page.evaluate(
    (selector, value) => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    },
    selector,
    value,
  );
}
/** The number of the visible step, or null. */
const visibleStep = (page) =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll("[data-step]")].find(
      (e) => !e.hidden && e.getBoundingClientRect().width > 0,
    );
    return el ? Number(el.getAttribute("data-step")) : null;
  });
const waitStep = (page, n) =>
  until(
    page,
    (n) => [...document.querySelectorAll("[data-step]")].some((e) => !e.hidden && Number(e.dataset.step) === n),
    n,
  );
const stepParam = (page) => new URL(page.url()).searchParams.get("step");
const draftRaw = (page) => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
const value = (page, selector) => page.evaluate((s) => document.querySelector(s)?.value ?? null, selector);
const shot = (page, name) => page.screenshot({ path: path.join(DIR, `apply-${name}.png`), fullPage: true });

/** "Devam" and wait for the next step to be shown. */
async function next(page, from) {
  if (!(await click(page, "button[type=submit]", "^Devam$"))) throw new Error("no Devam button");
  if (!(await waitStep(page, from + 1))) throw new Error(`step ${from + 1} not shown`);
}

const TEXT = "Birlikte güvenli sürüşler yapmak istiyorum.";
async function fillStep1(page, { bike = false, years = "5", months = null } = {}) {
  await pick(page, "license_class", "A2");
  await typeInto(page, "input[name=riding_years]", years);
  if (months !== null) await typeInto(page, "input[name=riding_months]", months);
  await pick(page, "owns_motorcycle", bike ? "Evet" : "Hayır");
  if (bike) {
    await typeInto(page, "input[name=motorcycle_brand]", "Honda");
    await typeInto(page, "input[name=motorcycle_model]", "CB650R");
  }
  await pick(page, "riding_styles", "Şehir içi");
  await pick(page, "group_experience", "Biraz");
}
async function fillStep2(page, { other = false } = {}) {
  await pick(page, "in_other_clubs", "Hayır");
  await pick(page, "heard_from", "Instagram reklamı");
  await pick(page, "event_interests", other ? "Diğer" : "Kamp");
  if (other) await typeInto(page, "input[name=other_event_interests]", "Gece sürüşleri");
}
async function fillStep3(page) {
  for (const name of ["expectations", "alienating_behaviors", "conflict_handling"])
    await typeInto(page, `textarea[name=${name}]`, TEXT);
}
async function fillStep4(page, { consents = true } = {}) {
  await typeInto(page, "input[name=full_name]", "Apply Testkisi");
  await typeInto(page, "input#phone", "5321234567");
  await typeInto(page, "input[name=email]", TEST_EMAIL);
  await setInputValue(page, "input[name=birth_date]", "1990-05-17");
  await page.select("select#district", "Kadıköy");
  await pick(page, "languages", "Türkçe");
  if (consents) {
    for (const name of ["consent_privacy", "consent_rules"]) {
      const el = await find(page, `[data-field="${name}"] [role=checkbox]`);
      await el.evaluate((b) => b.scrollIntoView({ block: "center" }));
      await el.click();
    }
  }
  await sleep(150);
}

try {
  // step1-errors-only
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await shot(page, "step1-empty");
    await click(page, "button[type=submit]", "^Devam$");
    const errors = await hasText(page, /Bu alan zorunlu\./);
    const s = await page.evaluate(() => ({
      step2Errors:
        document.querySelector('[data-step="2"]')?.textContent.includes("Bu alan zorunlu.") ||
        !!document.querySelector('[data-step="2"] [data-invalid="true"]'),
      step4Errors:
        document.querySelector('[data-step="4"]')?.textContent.includes("Bu alan zorunlu.") ||
        !!document.querySelector('[data-step="4"] [data-invalid="true"]'),
      invalidSteps: [...document.querySelectorAll('[data-invalid="true"]')].map((e) =>
        e.closest("[data-step]")?.getAttribute("data-step"),
      ),
    }));
    const focusInLicence = await until(page, () => !!document.activeElement?.closest('[data-field="license_class"]'));
    await shot(page, "step1-errors");
    check(
      "step1-errors-only",
      !!errors &&
        stepParam(page) === null &&
        s.invalidSteps.length > 0 &&
        s.invalidSteps.every((x) => x === "1") &&
        !s.step2Errors &&
        !s.step4Errors &&
        !!focusInLicence,
      `step=${stepParam(page)} invalid in steps ${[...new Set(s.invalidSteps)]} focus in licence group: ${!!focusInLicence}`,
    );
    await ctx.close();
  }

  // enter-acts-as-next + back-button (continuation)
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page);
    const posts = [];
    page.on("request", (r) => {
      if (r.method() === "POST") posts.push(r.url());
    });
    const years = await find(page, "input[name=riding_years]");
    await years.focus();
    await page.keyboard.press("Enter");
    const reached = await waitStep(page, 2);
    await sleep(800);
    await shot(page, "step2");
    check(
      "enter-acts-as-next",
      !!reached && stepParam(page) === "2" && posts.length === 0,
      `step=${stepParam(page)} POSTs=${posts.length}`,
    );

    await page.goBack();
    const back = await waitStep(page, 1);
    const years1 = await value(page, "input[name=riding_years]");
    const licence = await page.evaluate(() =>
      document
        .querySelector('[data-field="license_class"] [role=radio][aria-checked=true]')
        ?.closest("label")
        ?.textContent.trim(),
    );
    check(
      "back-button",
      !!back && years1 === "5" && licence === "A2",
      `step visible=${await visibleStep(page)} years=${years1} licence=${licence}`,
    );
    await ctx.close();
  }

  // riding-months: years 0 asks for the months (required, kept in the draft); other years unmount the field
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page);
    const months = (p) => find(p, "input[name=riding_months]");
    const hiddenBefore = !(await months(page));
    await typeInto(page, "input[name=riding_years]", "0");
    const shown =
      !!(await until(page, () => !!document.querySelector("input[name=riding_months]"))) && !!(await months(page));
    await shot(page, "riding-months");
    await click(page, "button[type=submit]", "^Devam$");
    const required = !!(await until(page, () =>
      /Bu alan zorunlu\./.test(document.querySelector('[data-field="riding_months"]')?.textContent ?? ""),
    ));
    const stayed = (await visibleStep(page)) === 1;
    await typeInto(page, "input[name=riding_months]", "5");
    await sleep(1200); // longer than the draft save debounce
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);
    const yearsBack = await value(page, "input[name=riding_years]");
    const monthsBack = await value(page, "input[name=riding_months]");
    await typeInto(page, "input[name=riding_months]", "4");
    await typeInto(page, "input[name=riding_years]", "3");
    const gone = !!(await until(page, () => !document.querySelector("input[name=riding_months]")));
    const inFormData = await page.evaluate(() =>
      new FormData(document.querySelector("input[name=riding_years]").form).has("riding_months"),
    );
    check(
      "riding-months",
      hiddenBefore && shown && required && stayed && yearsBack === "0" && monthsBack === "5" && gone && !inFormData,
      `hiddenBefore=${hiddenBefore} shown=${shown} required=${required && stayed} restored=${yearsBack}/${monthsBack} hiddenAt3=${gone} inFormData=${inFormData}`,
    );
    await ctx.close();
  }

  // draft-restore + draft-no-personal-data (continuation)
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page, { bike: true });
    await next(page, 1);
    await fillStep2(page, { other: true });
    await next(page, 2);
    await typeInto(page, "textarea[name=expectations]", "Yeni rotalar keşfetmek istiyorum");
    await sleep(700);
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);
    const step = await waitStep(page, 3);
    const expectations = await value(page, "textarea[name=expectations]");
    const restored = await hasText(page, /Kaldığın yerden devam ediyorsun\./);
    await shot(page, "step3-restored");
    await click(page, "button", "^Geri$");
    await waitStep(page, 2);
    const otherEvent = await value(page, "input[name=other_event_interests]");
    await click(page, "button", "^Geri$");
    await waitStep(page, 1);
    const brand = await value(page, "input[name=motorcycle_brand]");
    const model = await value(page, "input[name=motorcycle_model]");
    const brandVisible = !!(await find(page, "input[name=motorcycle_brand]"));
    check(
      "draft-restore",
      !!step &&
        !!restored &&
        expectations === "Yeni rotalar keşfetmek istiyorum" &&
        otherEvent === "Gece sürüşleri" &&
        brand === "Honda" &&
        model === "CB650R" &&
        brandVisible,
      `step3=${!!step} text=${expectations} restoredLine=${!!restored} otherEvent=${otherEvent} brand=${brand}/${model} visible=${brandVisible}`,
    );

    // Step 4 contact details must never reach the draft.
    await page.goto(`${BASE}/apply?step=4`, { waitUntil: "networkidle0" });
    await sleep(500);
    const before = JSON.parse((await draftRaw(page)) ?? "null");
    await fillStep4(page);
    // Force a save after step 4 was filled (a step 1-3 answer changes; step 4 inputs would otherwise be unproven).
    await setInputValue(page, "input[name=riding_years]", "9");
    const saved = await until(
      page,
      (k) => JSON.parse(localStorage.getItem(k) ?? "null")?.fields?.riding_years === "9",
      DRAFT_KEY,
    );
    await sleep(700);
    const raw = (await draftRaw(page)) ?? "";
    const savedAfter = !!before && !!saved && JSON.parse(raw).savedAt !== before.savedAt;
    const forbiddenKeys = [
      "full_name",
      "phone",
      "email",
      "birth_date",
      "city_choice",
      "district",
      "instagram",
      "languages",
      "consent_privacy",
      "consent_rules",
      "consent_photos",
    ];
    const forbiddenValues = ["Apply Testkisi", "5321234567", "532 123", TEST_EMAIL, "1990-05-17", "Kadıköy"];
    const keyLeaks = forbiddenKeys.filter((k) => raw.includes(`"${k}"`));
    const valueLeaks = forbiddenValues.filter((v) => raw.includes(v));
    await shot(page, "step4-filled");
    check(
      "draft-no-personal-data",
      savedAfter && raw.length > 0 && keyLeaks.length === 0 && valueLeaks.length === 0,
      `save after step 4 filled=${savedAfter} key leaks=${keyLeaks} value leaks=${valueLeaks.length}`,
    );
    await ctx.close();
  }

  // language-switch-keeps-draft, then start-over (separate context)
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page);
    await next(page, 1);
    await pick(page, "heard_from", "Instagram reklamı");
    await pick(page, "in_other_clubs", "Evet");
    // The last answer is typed text; switch at once (no sleep): only the focus-leave / unmount flush can save it.
    await typeInto(page, "input[name=other_club_names]", "Gece Atlıları");
    const tTyped = Date.now();
    await click(page, "button", "Dil: TR$");
    let clickedEn = false;
    for (let i = 0; i < 50 && !clickedEn; i++)
      clickedEn = (await click(page, "[role=menuitemradio]", "English")) || (await sleep(20), false);
    const sinceTyped = Date.now() - tTyped;
    const onEn = await until(
      page,
      () => location.pathname.startsWith("/en/apply") && /Step 2 of 4/.test(document.body.innerText),
    );
    await sleep(500);
    const clubs = await value(page, "input[name=other_club_names]");
    const heard = await page.evaluate(() =>
      document
        .querySelector('[data-field="heard_from"] [role=radio][aria-checked=true]')
        ?.closest("label")
        ?.textContent.trim(),
    );
    const years = await value(page, "input[name=riding_years]");
    await shot(page, "step2-en");
    check(
      "language-switch-keeps-draft",
      clickedEn &&
        !!onEn &&
        (await visibleStep(page)) === 2 &&
        heard === "Instagram ad" &&
        years === "5" &&
        clubs === "Gece Atlıları",
      `path=${new URL(page.url()).pathname}${new URL(page.url()).search} step=${await visibleStep(page)} heard_from=${heard} years=${years} other_club_names=${clubs} (switch ${sinceTyped} ms after typing)`,
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page);
    await next(page, 1);
    await sleep(700);
    await page.reload({ waitUntil: "networkidle0" });
    await sleep(500);
    const restored = await hasText(page, /Kaldığın yerden devam ediyorsun\./);
    const clicked = await click(page, "button", "Baştan başla");
    const atStep1 = await waitStep(page, 1);
    await sleep(900); // longer than the save debounce: nothing may re-create the draft
    const years = await value(page, "input[name=riding_years]");
    const checked = await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-step="1"] [role=radio][aria-checked=true], [data-step="2"] [role=radio][aria-checked=true]',
        ).length,
    );
    const line = /Kaldığın yerden/.test(await bodyText(page));
    check(
      "start-over",
      !!restored &&
        clicked &&
        !!atStep1 &&
        stepParam(page) === "1" &&
        years === "" &&
        checked === 0 &&
        !line &&
        (await draftRaw(page)) === null,
      `step=${stepParam(page)} years="${years}" checked=${checked} draft=${(await draftRaw(page)) === null ? "absent" : "present"}`,
    );
    await ctx.close();
  }

  // deep-link-step4
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply?step=4");
    const onStep4 = await waitStep(page, 4);
    await fillStep4(page);
    await click(page, "button[type=submit]", "^Başvuruyu gönder$");
    const atStep1 = await waitStep(page, 1);
    const focusIn1 = await until(
      page,
      () => !!document.activeElement?.closest('[data-step="1"]') && document.activeElement !== document.body,
    );
    check(
      "deep-link-step4",
      !!onStep4 && !!atStep1 && stepParam(page) === "1" && !!focusIn1,
      `step=${stepParam(page)} focus in step 1: ${!!focusIn1}`,
    );
    await ctx.close();
  }

  // writing-minimum
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply?step=3");
    const tooShort = () =>
      page.evaluate(() =>
        document.querySelector('[data-field="expectations"]')?.textContent.includes("Biraz daha detay yazar mısın?"),
      );
    await typeInto(page, "textarea[name=expectations]", "12345678901234"); // 14
    await page.evaluate(() => document.activeElement?.blur());
    const shown14 = await until(page, () =>
      document.querySelector('[data-field="expectations"]')?.textContent.includes("Biraz daha detay yazar mısın?"),
    );
    const area = await find(page, "textarea[name=expectations]");
    await area.focus();
    await page.keyboard.press("End");
    await page.keyboard.type("5"); // 15
    await page.evaluate(() => document.activeElement?.blur());
    await sleep(300);
    const shown15 = await tooShort();
    check(
      "writing-minimum",
      !!shown14 && !shown15,
      `14 chars: tooShort shown=${!!shown14}; 15 chars: shown=${!!shown15}`,
    );
    await ctx.close();
  }

  // submit-clears-draft
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply");
    await fillStep1(page, { years: "0", months: "4" });
    await next(page, 1);
    await fillStep2(page);
    await next(page, 2);
    await fillStep3(page);
    await shot(page, "step3");
    await next(page, 3);
    await sleep(700);
    const draftBefore = (await draftRaw(page)) !== null;
    await fillStep4(page);
    await shot(page, "step4-ready");
    await click(page, "button[type=submit]", "^Başvuruyu gönder$");
    const success = await hasText(page, /Başvurun alındı!/);
    await shot(page, "success");
    await sleep(1500); // longer than the save debounce: a late save would re-create the draft
    const draftAfter = await draftRaw(page);
    const rows = testApplicationCount();
    const riding = sql(`select riding_years || '/' || riding_months from applications where email = '${TEST_EMAIL}'`);
    check(
      "submit-clears-draft",
      draftBefore && !!success && draftAfter === null && rows === 1 && riding === "0/4",
      `draft before=${draftBefore} success=${!!success} draft after=${draftAfter === null ? "absent" : "present"} rows=${rows} years/months=${riding}`,
    );
    deleteTestApplication();
    await ctx.close();
  }

  // google-button
  {
    const { ctx, page } = await fresh();
    await go(page, "/apply?step=4");
    const btn = await find(page, "button", "Google ile doldur");
    const hint = /Ad ve e-postan otomatik gelir\./.test(await bodyText(page));
    await shot(page, "step4-google");
    const authorize = [];
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      if (r.url().startsWith("http://127.0.0.1:54321/auth/v1/authorize")) {
        authorize.push(r.url());
        r.abort();
      } else r.continue();
    });
    if (btn) {
      await btn.evaluate((b) => b.scrollIntoView({ block: "center" }));
      await btn.click();
    }
    await until(page, () => true, null, 100);
    const t0 = Date.now();
    while (authorize.length === 0 && Date.now() - t0 < 8000) await sleep(100);
    let next = null;
    if (authorize[0]) {
      const redirectTo = new URL(authorize[0]).searchParams.get("redirect_to");
      next = redirectTo ? new URL(redirectTo).searchParams.get("next") : null;
    }
    const draftStep = JSON.parse((await draftRaw(page).catch(() => null)) ?? "null")?.step ?? null;
    await ctx.close();

    const ig = await fresh(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.0",
    );
    await go(ig.page, "/apply?step=4");
    // Positive control: step 4 is shown and hydrated (the form remounts on hydration; the honeypot-free email input
    // is visible), so an absent button means "hidden for this UA", not "never rendered".
    const igRendered = await until(ig.page, () => {
      const email = document.querySelector("input[name=email]");
      const step = document.querySelector('[data-step="4"]');
      return !!email && !!step && !step.hidden && email.getBoundingClientRect().width > 0;
    });
    // Hydrated: the client-only user agent is read; a normal UA shows the button within this window, Instagram never.
    await sleep(1500);
    let igBtn = null;
    let igHint = false;
    for (let i = 0; i < 10 && !igBtn && !igHint; i++) {
      igBtn = await find(ig.page, "button", "Google ile doldur");
      igHint = /Ad ve e-postan otomatik gelir\./.test(await bodyText(ig.page));
      await sleep(100);
    }
    const igUa = await ig.page.evaluate(() => navigator.userAgent.includes("Instagram"));
    await ig.ctx.close();
    check(
      "google-button",
      !!btn && hint && authorize.length >= 1 && next === "/apply?step=4" && !!igRendered && igUa && !igBtn && !igHint,
      `button=${!!btn} hint=${hint} authorize requests=${authorize.length} next=${next} instagram UA (step 4 rendered=${!!igRendered}): button=${!!igBtn} hint=${igHint} (draft step ${draftStep})`,
    );
  }

  // signed-in-no-google
  {
    const exists = sql("select count(*) from auth.users where email = 'pending-noapp@test.local'") === "1";
    const { ctx, page } = await fresh();
    let signedIn = false;
    if (exists)
      signedIn = await signIn(page, "pending-noapp@test.local", BASE).then(
        () => true,
        () => false,
      );
    if (!signedIn) {
      console.log(
        `SKIP signed-in-no-google — ${exists ? "email sign-in is disabled locally" : "pending-noapp@test.local does not exist"}`,
      );
    } else {
      await go(page, "/apply?step=4");
      await waitStep(page, 4);
      const btn = await find(page, "button", "Google ile doldur");
      const email = await value(page, "input[name=email]");
      check("signed-in-no-google", !btn && email === "pending-noapp@test.local", `button=${!!btn} email=${email}`);
    }
    await ctx.close();
  }
} finally {
  deleteTestApplication();
  await browser.close();
}
const left = testApplicationCount();
if (left !== 0) {
  fails++;
  console.log(`FAIL cleanup — ${left} test application rows left`);
}
console.log(fails === 0 ? "ALL PASS" : `${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
