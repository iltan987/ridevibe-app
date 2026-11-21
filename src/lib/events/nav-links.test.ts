// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { navLinks } from "./nav-links.ts";

const STARBUCKS = "https://www.google.com/maps/place/Starbucks,+Moda+Cd.+No:1,+Kad%C4%B1k%C3%B6y";
const LABEL = "Starbucks, Moda Cd. No:1, Kadıköy";

test("point only", () => {
  const links = navLinks({
    name: "Moda Sahili",
    point: { lat: 40.98, lng: 29.0254 },
    venueUrl: null,
    venueLabel: null,
  });
  assert.deepEqual(links, {
    open: {
      google: "https://www.google.com/maps/search/?api=1&query=40.980000,29.025400",
      apple: "https://maps.apple.com/?ll=40.980000,29.025400&q=Moda%20Sahili",
      yandex: "https://yandex.com.tr/maps/?pt=29.025400,40.980000&z=16&l=map",
    },
    route: {
      google: "https://www.google.com/maps/dir/?api=1&destination=40.980000,29.025400",
      apple: "https://maps.apple.com/?daddr=40.980000,29.025400",
      yandex: "https://yandex.com.tr/maps/?rtext=~40.980000,29.025400&rtt=auto",
      yandexNavi: "yandexnavi://build_route_on_map?lat_to=40.980000&lon_to=29.025400",
    },
    coords: "40.980000, 29.025400",
  });
});

test("venue only searches the label", () => {
  const q = encodeURIComponent(LABEL);
  const links = navLinks({ name: "Starbucks", point: null, venueUrl: STARBUCKS, venueLabel: LABEL });
  assert.deepEqual(links, {
    open: {
      google: STARBUCKS,
      apple: `https://maps.apple.com/?q=${q}`,
      yandex: `https://yandex.com.tr/maps/?text=${q}`,
    },
    route: {
      google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
      apple: `https://maps.apple.com/?daddr=${q}`,
      yandex: `https://yandex.com.tr/maps/?text=${q}`,
      yandexNavi: null,
    },
    coords: null,
  });
});

test("venue only without a label searches the place name", () => {
  const links = navLinks({ name: "Kahve & Çay", point: null, venueUrl: STARBUCKS, venueLabel: null });
  assert.equal(links.open.apple, `https://maps.apple.com/?q=${encodeURIComponent("Kahve & Çay")}`);
});

test("both: venue opens in Google, every route uses the point", () => {
  const links = navLinks({
    name: "Starbucks",
    point: { lat: 41.0255, lng: 29.0154 },
    venueUrl: STARBUCKS,
    venueLabel: LABEL,
  });
  assert.equal(links.open.google, STARBUCKS);
  assert.equal(links.open.apple, "https://maps.apple.com/?ll=41.025500,29.015400&q=Starbucks");
  assert.equal(links.route.google, "https://www.google.com/maps/dir/?api=1&destination=41.025500,29.015400");
  assert.equal(links.route.yandexNavi, "yandexnavi://build_route_on_map?lat_to=41.025500&lon_to=29.015400");
  assert.equal(links.coords, "41.025500, 29.015400");
});

const YANDEX_ORG = "https://yandex.com.tr/maps/org/starbucks/1234567890/";

test("Yandex venue only: Yandex opens the org page, Google and Apple search the label", () => {
  const q = encodeURIComponent(LABEL);
  const links = navLinks({ name: "Starbucks", point: null, venueUrl: YANDEX_ORG, venueLabel: LABEL });
  assert.deepEqual(links.open, {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    yandex: YANDEX_ORG,
  });
  assert.equal(links.route.yandex, `https://yandex.com.tr/maps/?text=${q}`);
  assert.equal(links.route.yandexNavi, null);
});

test("pin and Yandex venue: Yandex opens the org page, Google keeps the pin", () => {
  const links = navLinks({
    name: "Starbucks",
    point: { lat: 41.0255, lng: 29.0154 },
    venueUrl: YANDEX_ORG,
    venueLabel: LABEL,
  });
  assert.deepEqual(links.open, {
    google: "https://www.google.com/maps/search/?api=1&query=41.025500,29.015400",
    apple: "https://maps.apple.com/?ll=41.025500,29.015400&q=Starbucks",
    yandex: YANDEX_ORG,
  });
});

test("pin and Google venue: Google opens the venue, Yandex keeps the pin", () => {
  const links = navLinks({
    name: "Starbucks",
    point: { lat: 41.0255, lng: 29.0154 },
    venueUrl: STARBUCKS,
    venueLabel: LABEL,
  });
  assert.deepEqual(links.open, {
    google: STARBUCKS,
    apple: "https://maps.apple.com/?ll=41.025500,29.015400&q=Starbucks",
    yandex: "https://yandex.com.tr/maps/?pt=29.015400,41.025500&z=16&l=map",
  });
});
