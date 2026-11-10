// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { chromeIntentUrl, detectInAppBrowser, isAndroid } from "./in-app-browser.ts";

const instagramIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 332.0.0.16.110 (iPhone16,2; iOS 17_5_1; tr_TR; tr; scale=3.00; 1179x2556; 586325329)";
const facebookIos =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/460.0.0.40.108;FBBV/591234567;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/tr_TR;FBOP/5]";
const facebookAndroid =
  "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.43.109;]";
const tiktokAndroid =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.6422.165 Mobile Safari/537.36 trill_2023405030 JsSdk/1.0 NetType/WIFI Channel/googleplay AppName/musical_ly app_version/34.5.3 ByteLocale/tr-TR";
const desktopChrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const iosSafari =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const androidChrome =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.6422.165 Mobile Safari/537.36";

test("detects in-app browsers", () => {
  assert.equal(detectInAppBrowser(instagramIos), "Instagram");
  assert.equal(detectInAppBrowser(facebookIos), "Facebook");
  assert.equal(detectInAppBrowser(facebookAndroid), "Facebook");
  assert.equal(detectInAppBrowser(tiktokAndroid), "TikTok");
  assert.equal(detectInAppBrowser("Mozilla/5.0 (iPhone) Mobile/15E148 LinkedInApp"), "LinkedIn");
});

test("does not flag normal browsers", () => {
  for (const ua of [desktopChrome, iosSafari, androidChrome, ""]) {
    assert.equal(detectInAppBrowser(ua), null, ua);
  }
});

test("detects Android", () => {
  assert.equal(isAndroid(androidChrome), true);
  assert.equal(isAndroid(facebookAndroid), true);
  assert.equal(isAndroid(iosSafari), false);
  assert.equal(isAndroid(desktopChrome), false);
});

test("builds a Chrome intent URL with an encoded fallback", () => {
  assert.equal(
    chromeIntentUrl("https://ridevibe.com.tr/sign-in?next=%2Fapply"),
    "intent://ridevibe.com.tr/sign-in?next=%2Fapply#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fridevibe.com.tr%2Fsign-in%3Fnext%3D%252Fapply;end",
  );
});
