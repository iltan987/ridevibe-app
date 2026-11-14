// SEO check: robots/sitemap, <head> metadata, noindex, JSON-LD, locale cookie/redirect behaviour, hreflang, icon.
// Plain fetch, no puppeteer. Env: BASE (default http://localhost:3123; a production URL works too).
const BASE = (process.env.BASE ?? "http://localhost:3123").replace(/\/$/, "");
const SITE = "https://ridevibe.com.tr";
let fails = 0;
const check = (name, ok, extra = "") => {
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
};

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const norm = (u) => {
  try {
    return new URL(u).href;
  } catch {
    return u;
  }
};

async function get(path, headers = {}) {
  try {
    const res = await fetch(BASE + path, { redirect: "manual", headers, signal: AbortSignal.timeout(15000) });
    return { res, status: res.status, body: await res.text() };
  } catch (e) {
    check(`GET ${path}`, false, String(e?.cause?.code ?? e?.message ?? e));
    return { res: new Response(null, { status: 599 }), status: 599, body: "" };
  }
}
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((m) => {
    const attrs = {};
    for (const a of m[0].matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)) attrs[a[1].toLowerCase()] = decode(a[2]);
    return attrs;
  });
}
const metas = (html) => tags(html, "meta");
const meta = (html, key) =>
  metas(html)
    .filter((m) => (m.property ?? m.name) === key)
    .map((m) => m.content);
const one = (html, key) => meta(html, key)[0];
const title = (html) => {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m ? decode(m[1]) : "";
};
const canonical = (html) => tags(html, "link").find((l) => l.rel === "canonical")?.href;

// robots + sitemap
{
  const r = await get("/robots.txt");
  check("robots.txt 200 text", r.status === 200 && /text\/plain/.test(r.res.headers.get("content-type") ?? ""));
  check("robots.txt Sitemap line", r.body.includes(`Sitemap: ${SITE}/sitemap.xml`));
  const s = await get("/sitemap.xml");
  const locs = [...s.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).sort();
  const want = [`${SITE}`, `${SITE}/apply`, `${SITE}/en`, `${SITE}/en/apply`].map(norm).sort();
  check("sitemap.xml 200", s.status === 200 && /xml/.test(s.res.headers.get("content-type") ?? ""));
  check(
    "sitemap.xml has exactly the four URLs",
    JSON.stringify(locs.map(norm)) === JSON.stringify(want),
    locs.join(" "),
  );
}

// indexable pages
const pages = [
  { path: "/", url: `${SITE}/`, locale: "tr_TR", alt: "en_US" },
  { path: "/en", url: `${SITE}/en`, locale: "en_US", alt: "tr_TR" },
  { path: "/apply", url: `${SITE}/apply`, locale: "tr_TR", alt: "en_US" },
  { path: "/en/apply", url: `${SITE}/en/apply`, locale: "en_US", alt: "tr_TR" },
];
const heads = {};
for (const p of pages) {
  const { res, status, body: h } = await get(p.path);
  heads[p.path] = h;
  const n = p.path;
  check(`${n} 200`, status === 200);
  check(`${n} title`, title(h).length > 0, title(h));
  check(`${n} description`, (one(h, "description") ?? "").length > 0);
  check(`${n} canonical = ${p.url}`, norm(canonical(h) ?? "") === norm(p.url), canonical(h));
  check(`${n} og:url = canonical`, norm(one(h, "og:url") ?? "") === norm(p.url), one(h, "og:url"));
  check(`${n} og:type website`, one(h, "og:type") === "website");
  check(`${n} og:site_name`, one(h, "og:site_name") === "Ride & Vibe", one(h, "og:site_name"));
  check(`${n} og:locale ${p.locale}`, one(h, "og:locale") === p.locale);
  check(
    `${n} og:locale:alternate ${p.alt}`,
    JSON.stringify(meta(h, "og:locale:alternate")) === JSON.stringify([p.alt]),
  );
  check(
    `${n} og:image + size/type/alt`,
    !!one(h, "og:image") &&
      !!one(h, "og:image:width") &&
      !!one(h, "og:image:height") &&
      !!one(h, "og:image:type") &&
      !!one(h, "og:image:alt"),
  );
  check(`${n} twitter:card summary_large_image`, one(h, "twitter:card") === "summary_large_image");
  check(`${n} twitter:title = og:title`, !!one(h, "twitter:title") && one(h, "twitter:title") === one(h, "og:title"));
  check(`${n} twitter:image`, !!one(h, "twitter:image"));
  check(
    `${n} no noindex (meta + x-robots-tag)`,
    !/noindex/i.test(one(h, "robots") ?? "") && !/noindex/i.test(res.headers.get("x-robots-tag") ?? ""),
  );
}
check("/ and /en titles differ", title(heads["/"]) !== title(heads["/en"]));
check("/ and /en descriptions differ", one(heads["/"], "description") !== one(heads["/en"], "description"));
check("/apply and /en/apply titles differ", title(heads["/apply"]) !== title(heads["/en/apply"]));
check(
  "/apply and /en/apply descriptions differ",
  one(heads["/apply"], "description") !== one(heads["/en/apply"], "description"),
);

// query strings do not leak into canonical
{
  const { body: h } = await get("/apply?step=2&utm_source=ig");
  check("/apply?step=2&utm_source=ig canonical", norm(canonical(h) ?? "") === `${SITE}/apply`, canonical(h));
  check("/apply?step=2&utm_source=ig og:url", norm(one(h, "og:url") ?? "") === `${SITE}/apply`, one(h, "og:url"));
}

// noindex
for (const path of [
  "/privacy",
  "/en/privacy",
  "/events",
  "/en/events",
  "/gallery",
  "/en/gallery",
  "/members",
  "/account",
  "/sign-in",
]) {
  const { res, body } = await get(path);
  const robots = one(body, "robots") ?? "";
  check(
    `${path} 200 + noindex`,
    res.status === 200 && (/noindex/i.test(robots) || /noindex/i.test(res.headers.get("x-robots-tag") ?? "")),
    `status ${res.status}`,
  );
}

// JSON-LD on the home pages
for (const path of ["/", "/en"]) {
  const h = heads[path];
  const blocks = [...h.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  let types = [];
  try {
    types = JSON.parse(blocks[0][1])["@graph"].map((x) => x["@type"]);
  } catch {
    /* reported below */
  }
  check(
    `${path} one ld+json with WebSite + SportsOrganization`,
    blocks.length === 1 && types.includes("WebSite") && types.includes("SportsOrganization"),
    `${blocks.length} block(s), ${types.join(",")}`,
  );
}

// locale handling
{
  const wa = await get("/", { "user-agent": "WhatsApp/2.23.20.0 A", "accept-language": "en" });
  check(
    "/ with Accept-Language en: 200 Turkish",
    wa.status === 200 && /<html[^>]*lang="tr"/.test(wa.body),
    `status ${wa.status}`,
  );
  const c = await get("/", { cookie: "NEXT_LOCALE=en" });
  const loc = c.res.headers.get("location") ?? "";
  check(
    "/ with NEXT_LOCALE=en: 307 to /en",
    c.status === 307 && new URL(loc, BASE).pathname === "/en",
    `${c.status} ${loc}`,
  );
  const e = await get("/en");
  const cookies = e.res.headers.getSetCookie?.() ?? [e.res.headers.get("set-cookie") ?? ""];
  check(
    "/en first visit sets NEXT_LOCALE Max-Age=31536000",
    cookies.some((x) => /NEXT_LOCALE=en/.test(x) && /Max-Age=31536000/i.test(x)),
    cookies.join(" | "),
  );
}

// hreflang header (paths and hreflang values; origins differ locally)
{
  const { res } = await get("/apply");
  const link = res.headers.get("link") ?? "";
  const alts = [...link.matchAll(/<([^>]+)>;\s*rel="alternate";\s*hreflang="([^"]+)"/g)].map((m) => [
    m[2],
    new URL(m[1]).pathname,
  ]);
  const map = Object.fromEntries(alts);
  check(
    "/apply hreflang header tr/en/x-default",
    map.tr === "/apply" && map.en === "/en/apply" && map["x-default"] === "/apply",
    link,
  );
}

// PNG icon in the home head
{
  const icons = tags(heads["/"], "link").filter((l) => /(^|\s)icon(\s|$)/.test(l.rel ?? ""));
  const png = icons.find((l) => /png/.test(l.type ?? "") && parseInt(l.sizes ?? "0", 10) >= 48);
  check("home head has a PNG icon >= 48px", !!png, icons.map((l) => `${l.type}/${l.sizes}`).join(" "));
}

// share image: the og:image URL has the production origin even locally, so fetch its path from BASE
{
  const src = one(heads["/"], "og:image");
  let ok = false,
    extra = String(src);
  if (src) {
    const u = new URL(src, SITE);
    const path = u.pathname + u.search;
    try {
      const res = await fetch(BASE + path, { redirect: "manual", signal: AbortSignal.timeout(15000) });
      const buf = await res.arrayBuffer();
      const type = res.headers.get("content-type") ?? "";
      const size = Number(res.headers.get("content-length")) || buf.byteLength;
      ok = res.status === 200 && type.startsWith("image/") && size < 600000;
      extra = `${path} ${res.status} ${type} ${size} bytes`;
    } catch (e) {
      extra = `${path} ${e?.message ?? e}`;
    }
  }
  check("og:image of / is 200, image/*, < 600000 bytes", ok, extra);
}

console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed");
process.exit(fails ? 1 : 0);
