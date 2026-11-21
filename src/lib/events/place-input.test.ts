// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedMapUrl, isShortMapUrl, parsePlaceInput } from "./place-input.ts";

const STARBUCKS_PATH = "Starbucks,+Cafera%C4%9Fa,+Muvakk%C4%B1thane+Cd.+No:9,+34710+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul";
const STARBUCKS_ID = "0x14cab93c1a414691:0x31f407649c1b19e0";
const STARBUCKS = {
  kind: "venue",
  url: `https://www.google.com/maps/place/${STARBUCKS_PATH}/data=!4m2!3m1!1s${STARBUCKS_ID}`,
  label: "Starbucks, Caferağa, Muvakkıthane Cd. No:9, 34710 Kadıköy/İstanbul",
};

const point = (lat: number, lng: number) => ({ kind: "point", point: { lat, lng } });

const parseCases: [string, string, unknown][] = [
  ["plain pair with space", "41.0255, 29.0154", point(41.0255, 29.0154)],
  ["plain pair without space", "41.0255,29.0154", point(41.0255, 29.0154)],
  ["plain pair, negative", "-33.86, 151.21", point(-33.86, 151.21)],
  [
    "google place without coordinates",
    `https://www.google.com/maps/place/${STARBUCKS_PATH}/data=!4m2!3m1!1s${STARBUCKS_ID}!18m1!1e1?g_ep=abc&entry=tts`,
    STARBUCKS,
  ],
  [
    "google.com.tr place, viewport segment dropped",
    `https://www.google.com.tr/maps/place/${STARBUCKS_PATH}/@41.01,28.97,17z/data=!4m2!3m1!1s${STARBUCKS_ID}`,
    STARBUCKS,
  ],
  [
    "maps.google.com place",
    `https://maps.google.com/maps/place/${STARBUCKS_PATH}/data=!4m2!3m1!1s${STARBUCKS_ID}`,
    STARBUCKS,
  ],
  [
    "google route: destination only, never the origin",
    "https://www.google.com/maps/dir/41.021111,29.004167/%C4%B0BB+Pa%C5%9Faliman%C4%B1+Sosyal+Tesisi/data=!4m8!4m7!1m1!4e1!1m3!2m2!1d29.0!2d41.0!3e0!3d41.0322013!4d29.0229043!5m1!1e1",
    point(41.0322013, 29.0229043),
  ],
  [
    "google route without data: destination segment",
    "https://www.google.com/maps/dir/41.021111,29.004167/41.0322013,29.0229043/",
    point(41.0322013, 29.0229043),
  ],
  ["google route without a destination point", "https://www.google.com/maps/dir/41.021111,29.004167/Some+Place/", null],
  ["google route with only an origin", "https://www.google.com/maps/dir/41.021111,29.004167/", null],
  [
    "google dropped pin",
    "https://www.google.com/maps/place/Millet+Park%C4%B1/data=!4m2!3m1!8m2!3d41.0233784!4d29.054398499999998!16s",
    point(41.0233784, 29.054398499999998),
  ],
  [
    "google viewport is not the place",
    "https://www.google.com/maps/place/Foo/@41.01,28.97,17z/data=!3m1!4b1!4m6!3m5!1s0x1:0x2!8m2!3d41.0255!4d29.0154",
    point(41.0255, 29.0154),
  ],
  ["google viewport alone", "https://www.google.com/maps/@41.01,28.97,17z", null],
  ["google q", "https://www.google.com/maps?q=41.0255,29.0154", point(41.0255, 29.0154)],
  [
    "google query (api=1)",
    "https://www.google.com/maps/search/?api=1&query=41.0255%2C29.0154",
    point(41.0255, 29.0154),
  ],
  ["google destination", "https://www.google.com/maps/dir/?api=1&destination=41.0255,29.0154", point(41.0255, 29.0154)],
  [
    "google destination ignores origin",
    "https://www.google.com/maps/dir/?api=1&origin=41.021111,29.004167&destination=41.0255,29.0154",
    point(41.0255, 29.0154),
  ],
  ["google ll", "https://maps.google.com/?ll=41.0255,29.0154", point(41.0255, 29.0154)],
  ["google q with words", "https://www.google.com/maps?q=Starbucks+Kadikoy", null],
  ["apple ll", "https://maps.apple.com/?ll=41.0255,29.0154", point(41.0255, 29.0154)],
  ["apple coordinate", "https://maps.apple.com/place?coordinate=41.0255,29.0154&name=Foo", point(41.0255, 29.0154)],
  [
    "yandex org",
    "https://yandex.com.tr/navi/org/starbucks/1317996799?si=x",
    {
      kind: "venue",
      url: "https://yandex.com.tr/maps/org/starbucks/1317996799/",
      label: null,
    },
  ],
  [
    "yandex.ru maps org normalised to yandex.com.tr",
    "https://yandex.ru/maps/org/starbucks/1317996799/?ll=29.0%2C41.0&z=17",
    {
      kind: "venue",
      url: "https://yandex.com.tr/maps/org/starbucks/1317996799/",
      label: null,
    },
  ],
  [
    "yandex route: destination only",
    "https://yandex.com.tr/navi?rtext=41.021111%2C29.004167~40.990536%2C29.023418&rtt=auto",
    point(40.990536, 29.023418),
  ],
  [
    "yandex pin: whatshere, longitude first",
    "https://yandex.com.tr/navi?whatshere%5Bpoint%5D=29.054398%2C41.023378&whatshere%5Bzoom%5D=17&ll=29.0544%2C41.0234&z=17&si=abc",
    point(41.023378, 29.054398),
  ],
  ["yandex pt", "https://yandex.com.tr/maps/?pt=29.0154,41.0255&z=15", point(41.0255, 29.0154)],
  ["yandex ll", "https://yandex.com/maps/?ll=29.0154,41.0255&z=15", point(41.0255, 29.0154)],
  [
    "yandex whatshere on maps",
    "https://yandex.com.tr/maps/?whatshere%5Bpoint%5D=29.0154%2C41.0255",
    point(41.0255, 29.0154),
  ],
  ["yandex pt with style", "https://yandex.com.tr/maps/?pt=29.0154,41.0255,pm2rdm", point(41.0255, 29.0154)],
  [
    "yandex pt with several points",
    "https://yandex.com.tr/maps/?pt=29.0154,41.0255,pm2rdm~28.9,41.1,pm2rdm",
    point(41.0255, 29.0154),
  ],
  [
    "google route with empty origin, coordinate destination",
    "https://www.google.com/maps/dir//41.03,29.02/",
    point(41.03, 29.02),
  ],
  [
    "google route with empty origin, named destination",
    "https://www.google.com/maps/dir//Some+Place/data=!4m2!3d41.0322013!4d29.0229043",
    point(41.0322013, 29.0229043),
  ],
  [
    "google venue URL over 500 characters",
    `https://www.google.com/maps/place/${"a".repeat(500)}/data=!4m2!3m1!1s${STARBUCKS_ID}`,
    null,
  ],
  [
    "google venue label over 200 characters: label null, venue kept",
    `https://www.google.com/maps/place/${"a".repeat(201)}/data=!4m2!3m1!1s${STARBUCKS_ID}`,
    {
      kind: "venue",
      url: `https://www.google.com/maps/place/${"a".repeat(201)}/data=!4m2!3m1!1s${STARBUCKS_ID}`,
      label: null,
    },
  ],
  ["share text around a link", `Starbucks\nhttps://maps.apple.com/?ll=41.0255,29.0154`, point(41.0255, 29.0154)],
  ["latitude out of range", "95, 29", null],
  ["longitude out of range", "41, 190", null],
  ["plain words", "Kadıköy iskele", null],
  ["empty string", "", null],
  ["blank string", "   ", null],
  ["short google link", "https://maps.app.goo.gl/AbCdEf123?g_st=ac", null],
  ["short link with a point in it is still not read", "https://maps.app.goo.gl/x?ll=41.0255,29.0154", null],
  ["foreign host", "https://evil.com/maps?ll=41.0255,29.0154", null],
  ["http link", "http://maps.apple.com/?ll=41.0255,29.0154", null],
];

for (const [name, input, expected] of parseCases) {
  test(`parsePlaceInput: ${name}`, () => {
    assert.deepEqual(parsePlaceInput(input), expected);
  });
}

test("parsePlaceInput never returns the route origin", () => {
  const inputs = [
    "https://www.google.com/maps/dir/41.021111,29.004167/X/data=!3d41.0322013!4d29.0229043",
    "https://yandex.com.tr/navi?rtext=41.021111%2C29.004167~40.990536%2C29.023418",
  ];
  for (const input of inputs) {
    assert.ok(!JSON.stringify(parsePlaceInput(input)).includes("41.021111"));
  }
});

const allowed = [
  "https://maps.app.goo.gl/AbCdEf",
  "https://goo.gl/maps/AbCdEf",
  "https://www.google.com/maps/place/Foo",
  "https://www.google.com/maps?q=1,2",
  "https://www.google.com.tr/maps/place/Foo",
  "https://maps.google.com/?q=1,2",
  "https://yandex.com.tr/maps/org/a/1/",
  "https://yandex.com.tr/navi?rtext=1,2~3,4",
  "https://yandex.com/maps/-/CCU",
  "https://yandex.ru/maps/org/a/1/",
  "https://maps.apple.com/?ll=1,2",
  "https://maps.apple/p/AbCd",
];
const refused = [
  "http://maps.app.goo.gl/AbCdEf",
  "http://www.google.com/maps",
  "https://maps.app.goo.gl.evil.com/x",
  "https://evil.com/maps.app.goo.gl",
  "https://evil.com/maps",
  "https://www.google.com/search?q=maps",
  "https://www.google.com/mapsx",
  "https://goo.gl/other",
  "https://169.254.169.254/maps",
  "https://localhost/maps",
  "https://127.0.0.1/maps",
  "https://x@maps.apple.com/",
  "https://user:pw@www.google.com/maps",
  "https://maps.apple.com:8443/?ll=1,2",
  "https://www.google.com:444/maps",
  "https://maps.apple.com./?ll=1,2",
  "ftp://maps.apple.com/",
];

for (const url of allowed) {
  test(`isAllowedMapUrl accepts ${url}`, () => {
    assert.equal(isAllowedMapUrl(new URL(url)), true);
  });
}
for (const url of refused) {
  test(`isAllowedMapUrl refuses ${url}`, () => {
    assert.equal(isAllowedMapUrl(new URL(url)), false);
  });
}

const short = [
  "https://maps.app.goo.gl/AbCdEf?g_st=ac",
  "https://goo.gl/maps/AbCdEf",
  "https://yandex.com.tr/maps/-/CCU",
  "https://yandex.com/maps/-/CCU",
  "https://yandex.ru/maps/-/CCU",
  "https://maps.apple/p/AbCd",
];
const notShort = [
  "https://www.google.com/maps/place/Foo",
  "https://yandex.com.tr/maps/org/a/1/",
  "https://maps.apple.com/?ll=1,2",
  "https://maps.app.goo.gl.evil.com/x",
  "http://maps.app.goo.gl/AbCdEf",
  "https://x@maps.app.goo.gl/AbCdEf",
  "https://goo.gl/other",
];

for (const url of short) {
  test(`isShortMapUrl accepts ${url}`, () => {
    assert.equal(isShortMapUrl(new URL(url)), true);
  });
}
for (const url of notShort) {
  test(`isShortMapUrl refuses ${url}`, () => {
    assert.equal(isShortMapUrl(new URL(url)), false);
  });
}

test("parsePlaceInput survives malformed percent-encoding", () => {
  assert.equal(parsePlaceInput("https://www.google.com/maps/dir/1,2/%E0%A4%A/"), null);
});
