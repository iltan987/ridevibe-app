// Run with: pnpm test
import assert from "node:assert/strict";
import { type TestContext, test } from "node:test";
import { resolvePlace } from "./resolve-place.ts";

// A fake `fetch`: answers each URL from a table (a redirect `Location` or a plain 200) and records every request.
type Answer = { location: string; status?: number } | { status: number } | "throw" | "timeout";

function fakeFetch(answers: Record<string, Answer>) {
  const table = new Map(Object.entries(answers));
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    requests.push({ url, init });
    const answer = table.get(url);
    if (answer === undefined) return Promise.reject(new Error("unexpected request"));
    if (answer === "throw") return Promise.reject(new TypeError("fetch failed"));
    if (answer === "timeout") return Promise.reject(new DOMException("The operation timed out.", "TimeoutError"));
    const headers = "location" in answer ? { location: answer.location } : undefined;
    const status = answer.status ?? 302;
    return Promise.resolve(new Response(null, { status, headers }));
  };
  return { fetchImpl, requests };
}

/** Silences and captures console.error for the test. */
function captureErrors(t: TestContext) {
  return t.mock.method(console, "error", () => undefined);
}

const SHORT = "https://maps.app.goo.gl/AbCdEf123";
const SHORT_2 = "https://maps.app.goo.gl/Second";
const SHORT_3 = "https://maps.app.goo.gl/Third";
const SHORT_4 = "https://maps.app.goo.gl/Fourth";

const PIN =
  "https://www.google.com/maps/place/Millet+Park%C4%B1/data=!4m2!3m1!8m2!3d41.0233784!4d29.054398499999998!16s?g_st=ac";
const PLACE_PATH = "Starbucks,+Cafera%C4%9Fa,+Muvakk%C4%B1thane+Cd.+No:9,+34710+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul";
const PLACE_ID = "0x14cab93c1a414691:0x31f407649c1b19e0";
const PLACE = `https://www.google.com/maps/place/${PLACE_PATH}/data=!4m2!3m1!1s${PLACE_ID}!18m1!1e1?g_st=ac`;
const ORIGIN = "41.021111,29.004167";
const ROUTE = `https://www.google.com/maps/dir/${ORIGIN}/%C4%B0BB+Pa%C5%9Faliman%C4%B1/data=!4m8!4m7!1m1!4e1!1m3!2m2!1d29.0!2d41.0!3e0!3d41.0322013!4d29.0229043?g_st=ac`;

const pinPlace = { kind: "point", point: { lat: 41.0233784, lng: 29.054398499999998 } };

test("plain coordinates resolve without any request", async () => {
  const { fetchImpl, requests } = fakeFetch({});
  assert.deepEqual(await resolvePlace("41.0255, 29.0154", fetchImpl), {
    status: "ok",
    place: { kind: "point", point: { lat: 41.0255, lng: 29.0154 } },
  });
  assert.equal(requests.length, 0);
});

test("a full map link resolves without any request", async () => {
  const { fetchImpl, requests } = fakeFetch({});
  assert.deepEqual(await resolvePlace(PIN, fetchImpl), { status: "ok", place: pinPlace });
  assert.equal(requests.length, 0);
});

test("a short link to a dropped pin resolves to the point", async () => {
  const { fetchImpl, requests } = fakeFetch({ [SHORT]: { location: PIN } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "ok", place: pinPlace });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.init?.redirect, "manual");
  assert.ok(requests[0]?.init?.signal instanceof AbortSignal);
});

test("a short link inside shared text is found", async () => {
  const { fetchImpl } = fakeFetch({ [SHORT]: { location: PIN } });
  assert.deepEqual(await resolvePlace(`Millet Parkı\n${SHORT}`, fetchImpl), { status: "ok", place: pinPlace });
});

test("a short link to a place resolves to the cleaned venue", async () => {
  const { fetchImpl } = fakeFetch({ [SHORT]: { location: PLACE } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), {
    status: "ok",
    place: {
      kind: "venue",
      url: `https://www.google.com/maps/place/${PLACE_PATH}/data=!4m2!3m1!1s${PLACE_ID}`,
      label: "Starbucks, Caferağa, Muvakkıthane Cd. No:9, 34710 Kadıköy/İstanbul",
    },
  });
});

test("a short link to a route resolves to the destination only", async () => {
  const { fetchImpl } = fakeFetch({ [SHORT]: { location: ROUTE } });
  const result = await resolvePlace(SHORT, fetchImpl);
  assert.deepEqual(result, { status: "ok", place: { kind: "point", point: { lat: 41.0322013, lng: 29.0229043 } } });
  assert.ok(!JSON.stringify(result).includes("41.021111"));
});

test("a relative Location is read against the current hop", async () => {
  const { fetchImpl } = fakeFetch({ [SHORT]: { location: "/Second" }, [SHORT_2]: { location: PIN } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "ok", place: pinPlace });
});

test("a redirect off the allow-list stops without requesting it", async (t) => {
  captureErrors(t);
  const evil = "https://evil.com/maps/place/x/data=!3d41.0!4d29.0";
  const { fetchImpl, requests } = fakeFetch({ [SHORT]: { location: evil }, [evil]: { location: PIN } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" });
  assert.deepEqual(
    requests.map((r) => r.url),
    [SHORT],
  );
});

test("a redirect to plain http or an internal address stops", async (t) => {
  captureErrors(t);
  for (const location of ["http://www.google.com/maps/place/x", "https://169.254.169.254/latest/meta-data/"]) {
    const { fetchImpl, requests } = fakeFetch({ [SHORT]: { location } });
    assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" });
    assert.equal(requests.length, 1);
  }
});

test("three redirects are followed", async () => {
  const { fetchImpl, requests } = fakeFetch({
    [SHORT]: { location: SHORT_2 },
    [SHORT_2]: { location: SHORT_3 },
    [SHORT_3]: { location: PIN },
  });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "ok", place: pinPlace });
  assert.equal(requests.length, 3);
});

test("four chained redirects are unresolved", async (t) => {
  captureErrors(t);
  const { fetchImpl, requests } = fakeFetch({
    [SHORT]: { location: SHORT_2 },
    [SHORT_2]: { location: SHORT_3 },
    [SHORT_3]: { location: SHORT_4 },
    [SHORT_4]: { location: PIN },
  });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" });
  assert.equal(requests.length, 3);
});

test("a short link that doesn't redirect is unresolved", async (t) => {
  captureErrors(t);
  const { fetchImpl } = fakeFetch({ [SHORT]: { status: 200 } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" });
});

test("a redirect to a map page without a place is unresolved", async (t) => {
  captureErrors(t);
  const { fetchImpl } = fakeFetch({ [SHORT]: { location: "https://www.google.com/maps/@41.01,28.97,17z" } });
  assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" });
});

test("anything else is invalid without a request", async () => {
  const { fetchImpl, requests } = fakeFetch({});
  for (const text of [
    "",
    "Moda sahili",
    "https://evil.com/maps.app.goo.gl/x",
    "https://www.google.com/search?q=moda",
    "http://maps.app.goo.gl/AbCdEf123",
    "https://www.google.com/maps",
  ]) {
    assert.deepEqual(await resolvePlace(text, fetchImpl), { status: "invalid" }, text);
  }
  assert.equal(requests.length, 0);
});

test("a failed or timed-out request is unresolved", async (t) => {
  captureErrors(t);
  for (const answer of ["throw", "timeout"] as const) {
    const { fetchImpl } = fakeFetch({ [SHORT]: answer });
    assert.deepEqual(await resolvePlace(SHORT, fetchImpl), { status: "unresolved" }, answer);
  }
});

test("errors log a reason code only, never the link or a Location", async (t) => {
  const errors = captureErrors(t);
  const evil = `https://evil.com/maps/dir/${ORIGIN}/x`;
  const cases: Record<string, Answer>[] = [
    { [SHORT]: { location: evil } },
    { [SHORT]: { location: ROUTE.replace("!3d41.0322013!4d29.0229043", "") } },
    { [SHORT]: "throw" },
    { [SHORT]: "timeout" },
    { [SHORT]: { status: 200 } },
    { [SHORT]: { location: SHORT_2 }, [SHORT_2]: { location: SHORT_3 }, [SHORT_3]: { location: SHORT_4 } },
  ];
  for (const answers of cases) {
    const { fetchImpl } = fakeFetch(answers);
    await resolvePlace(SHORT, fetchImpl);
  }
  assert.equal(errors.mock.callCount(), cases.length);
  for (const call of errors.mock.calls) {
    const logged = JSON.stringify(call.arguments);
    assert.ok(!logged.includes("goo.gl") && !logged.includes("evil") && !logged.includes("41.02"), logged);
    assert.equal(call.arguments[0], "resolvePlace failed");
  }
});
