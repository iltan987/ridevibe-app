import assert from "node:assert/strict";
import { test } from "node:test";
import { clubJsonLd, serializeJsonLd } from "./json-ld.ts";

test("clubJsonLd describes the website and the club", () => {
  const g = clubJsonLd("desc");
  assert.equal(g["@context"], "https://schema.org");
  const site = {
    "@type": "WebSite",
    "@id": "https://ridevibe.com.tr/#website",
    name: "Ride & Vibe",
    alternateName: "Ride and Vibe",
    url: "https://ridevibe.com.tr/",
    publisher: { "@id": "https://ridevibe.com.tr/#organization" },
  };
  const org = {
    "@type": "SportsOrganization",
    "@id": "https://ridevibe.com.tr/#organization",
    name: "Ride & Vibe",
    alternateName: "Ride and Vibe",
    url: "https://ridevibe.com.tr/",
    logo: "https://ridevibe.com.tr/brand/icon-512.png",
    sameAs: ["https://www.instagram.com/rideandvibe34/"],
    description: "desc",
    sport: "Motorcycling",
    areaServed: { "@type": "City", name: "Istanbul" },
  };
  assert.deepEqual(g["@graph"], [site, org]);
});

test("serializeJsonLd escapes < so a payload cannot close the script tag", () => {
  assert.equal(serializeJsonLd({ a: "</script><b>" }), '{"a":"\\u003c/script>\\u003cb>"}');
  const g = clubJsonLd("desc");
  assert.deepEqual(JSON.parse(serializeJsonLd(g)), g);
});
