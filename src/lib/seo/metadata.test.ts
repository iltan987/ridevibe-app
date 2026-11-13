import assert from "node:assert/strict";
import { test } from "node:test";
import { pageMetadata, sharedOpenGraph } from "./metadata.ts";

test("sharedOpenGraph lists the other language as alternate", () => {
  assert.deepEqual(sharedOpenGraph("en"), {
    type: "website",
    siteName: "Ride & Vibe",
    locale: "en_US",
    alternateLocale: ["tr_TR"],
  });
});

test("pageMetadata: canonical, Open Graph, no robots key by default", () => {
  const m = pageMetadata({ locale: "en", path: "/apply", title: "Apply to join", description: "d" });
  assert.equal(m.title, "Apply to join");
  assert.equal(m.description, "d");
  assert.equal(m.alternates?.canonical, "https://ridevibe.com.tr/en/apply");
  assert.deepEqual(m.openGraph, {
    ...sharedOpenGraph("en"),
    url: "https://ridevibe.com.tr/en/apply",
    title: "Apply to join",
    description: "d",
  });
  assert.equal("robots" in m, false);
});

test("pageMetadata: absoluteTitle skips the title template", () => {
  const home = pageMetadata({ locale: "tr", path: "/", title: "T", description: "d", absoluteTitle: true });
  assert.deepEqual(home.title, { absolute: "T" });
});

test("pageMetadata: index false adds noindex", () => {
  assert.deepEqual(
    pageMetadata({ locale: "tr", path: "/privacy", title: "P", description: "d", index: false }).robots,
    { index: false },
  );
});

test("pageMetadata: images are passed through to openGraph", () => {
  const images = [{ url: "https://ridevibe.com.tr/x.png", width: 1200, height: 630 }];
  const m = pageMetadata({ locale: "tr", path: "/apply", title: "T", description: "d", images });
  assert.deepEqual(m.openGraph?.images, images);
});
