// Run with: pnpm test
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DISMISS_MS,
  detectInstallPlatform,
  installVariant,
  isDismissed,
  showsBanner,
  type InstallVariant,
} from "./platform.ts";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.122 Mobile/15E148 Safari/604.1",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 EdgiOS/140.0.3485.106 Mobile/15E148 Safari/605.1.15",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/141.0 Mobile/15E148 Safari/605.1.15",
  ipadSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:141.0) Gecko/141.0 Firefox/141.0",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36",
  macSafari174:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macSafari166:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  windowsFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:141.0) Gecko/20100101 Firefox/141.0",
};

const NO_TOUCH = { maxTouchPoints: 0 };

test("detectInstallPlatform: iPhone Safari is ios-safari", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 }), "ios-safari");
});

test("detectInstallPlatform: iOS browsers other than Safari are ios-other", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 }), "ios-other");
  assert.equal(detectInstallPlatform({ userAgent: UA.iphoneEdge, maxTouchPoints: 5 }), "ios-other");
  assert.equal(detectInstallPlatform({ userAgent: UA.iphoneFirefox, maxTouchPoints: 5 }), "ios-other");
});

test("detectInstallPlatform: iPadOS (Mac UA with touch) is ios-safari", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.ipadSafari, maxTouchPoints: 5 }), "ios-safari");
});

test("detectInstallPlatform: Android browsers are android", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.androidChrome, maxTouchPoints: 5 }), "android");
  assert.equal(detectInstallPlatform({ userAgent: UA.androidFirefox, maxTouchPoints: 5 }), "android");
  assert.equal(detectInstallPlatform({ userAgent: UA.samsungInternet, maxTouchPoints: 5 }), "android");
});

test("detectInstallPlatform: macOS Safari 17+ without touch is desktop-safari", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.macSafari174, ...NO_TOUCH }), "desktop-safari");
});

test("detectInstallPlatform: macOS Safari before 17 is other", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.macSafari166, ...NO_TOUCH }), "other");
});

test("detectInstallPlatform: desktop Chrome and Firefox are other", () => {
  assert.equal(detectInstallPlatform({ userAgent: UA.macChrome, ...NO_TOUCH }), "other");
  assert.equal(detectInstallPlatform({ userAgent: UA.windowsFirefox, ...NO_TOUCH }), "other");
});

test("installVariant: installed wins over everything", () => {
  for (const platform of ["ios-safari", "ios-other", "android", "desktop-safari", "other"] as const) {
    assert.equal(installVariant({ platform, hasPrompt: true, installed: true, androidFallback: true }), "none", platform);
  }
});

test("installVariant: a captured prompt wins on every platform", () => {
  for (const platform of ["ios-safari", "ios-other", "android", "desktop-safari", "other"] as const) {
    assert.equal(installVariant({ platform, hasPrompt: true, installed: false, androidFallback: false }), "prompt", platform);
  }
});

test("installVariant: android uses the manual fallback only when allowed", () => {
  assert.equal(installVariant({ platform: "android", hasPrompt: false, installed: false, androidFallback: false }), "none");
  assert.equal(installVariant({ platform: "android", hasPrompt: false, installed: false, androidFallback: true }), "android-manual");
});

test("installVariant: iOS and desktop-safari map to their own variant", () => {
  const s = { hasPrompt: false, installed: false, androidFallback: false };
  assert.equal(installVariant({ platform: "ios-safari", ...s }), "ios-safari");
  assert.equal(installVariant({ platform: "ios-other", ...s }), "ios-other");
  assert.equal(installVariant({ platform: "desktop-safari", ...s }), "desktop-safari");
});

test("installVariant: other platforms get nothing", () => {
  assert.equal(installVariant({ platform: "other", hasPrompt: false, installed: false, androidFallback: true }), "none");
});

test("showsBanner: true for the four banner variants only", () => {
  const shown: InstallVariant[] = ["prompt", "ios-safari", "ios-other", "android-manual"];
  for (const v of shown) assert.equal(showsBanner(v), true, v);
  assert.equal(showsBanner("desktop-safari"), false);
  assert.equal(showsBanner("none"), false);
});

test("isDismissed: never dismissed is not dismissed", () => {
  assert.equal(isDismissed(null, 1_000_000), false);
});

test("isDismissed: dismissed just inside the window", () => {
  const now = 1_800_000_000_000;
  assert.equal(isDismissed(now - DISMISS_MS + 1, now), true);
});

test("isDismissed: window ends exactly at DISMISS_MS", () => {
  const now = 1_800_000_000_000;
  assert.equal(isDismissed(now - DISMISS_MS, now), false);
});

test("DISMISS_MS is 30 days", () => {
  assert.equal(DISMISS_MS, 2_592_000_000);
});
