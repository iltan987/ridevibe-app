// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import robots from "./robots.ts";
import sitemap from "./sitemap.ts";

test("robots.txt allows everything and points at the sitemap", () => {
  assert.deepEqual(robots(), {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://ridevibe.com.tr/sitemap.xml",
  });
});

test("sitemap lists the public pages in both locales and nothing else", () => {
  assert.deepEqual(sitemap(), [
    { url: "https://ridevibe.com.tr/" },
    { url: "https://ridevibe.com.tr/apply" },
    { url: "https://ridevibe.com.tr/en" },
    { url: "https://ridevibe.com.tr/en/apply" },
  ]);
});
