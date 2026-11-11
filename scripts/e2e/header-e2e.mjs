// Theme script E2E: the <head> theme script across a language switch and an unknown path, with a stored light theme.
// No sign-in or fixtures needed. Run against `pnpm dev -p 3123` (the React "script tag" warning is dev-only) and
// against `pnpm start -p 3123`. Env: PUPPETEER_DIR (required), BASE_URL (default http://localhost:3123).
import { launch, newPage } from "./e2e-lib.mjs";
const BASE = process.env.BASE_URL ?? "http://localhost:3123";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const check = (name, ok, extra = "") => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`); };

const browser = await launch();

async function fresh() {
  const page = await newPage(await browser.createBrowserContext());
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.evaluateOnNewDocument(() => localStorage.setItem("theme", "light"));
  return { page, errors };
}
const scriptTagErrors = (errors) => errors.filter((e) => e.includes("Encountered a script tag"));
// Theme scripts in <head> that the browser would execute (no type, or a JavaScript type).
const state = (page) => page.evaluate(() => ({
  lang: document.documentElement.lang,
  dark: document.documentElement.classList.contains("dark"),
  executable: [...document.head.querySelectorAll("script:not([src])")]
    .filter((s) => s.textContent.includes("prefers-color-scheme"))
    .filter((s) => !s.type || /javascript/i.test(s.type)).length,
}));

// 1. Language switch (client-side navigation that remounts the [locale] layout).
{
  const { page, errors } = await fresh();
  await page.goto(BASE + "/", { waitUntil: "networkidle0" });
  await sleep(500);
  const before = await state(page);
  check("light theme applied on load", before.lang === "tr" && !before.dark, JSON.stringify(before));
  const trigger = await page.waitForSelector('[data-skeleton-result="locale-switcher"]:not([disabled])', { visible: true });
  await trigger.click();
  const item = await page.waitForSelector('[role="menuitemradio"]:not([aria-checked="true"])', { visible: true });
  await item.click();
  await page.waitForFunction(() => document.documentElement.lang === "en", { timeout: 15000 });
  await sleep(1000);
  const after = await state(page);
  check("still light after the language switch", !after.dark, JSON.stringify(after));
  check("client-rendered theme script is not executable", after.executable === 1, `executable: ${after.executable}`);
  check("no script-tag warning on language switch", scriptTagErrors(errors).length === 0, scriptTagErrors(errors)[0] ?? "");
}

// 2. Direct load of an unknown path (the 404 is rendered on the client in dev).
{
  const { page, errors } = await fresh();
  await page.goto(BASE + "/en/no-such-page-e2e", { waitUntil: "networkidle0" });
  await sleep(1000);
  const s = await state(page);
  check("404: light theme kept", !s.dark, JSON.stringify(s));
  check("404: no script-tag warning", scriptTagErrors(errors).length === 0, scriptTagErrors(errors)[0] ?? "");
}

await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASS");
process.exit(fails ? 1 : 0);
