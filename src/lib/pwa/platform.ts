// Install-prompt rules: which platform the visitor is on and which install variant to show.
// Dependency-free so it can be unit-tested with `node --test`.

export type InstallPlatform = "ios-safari" | "ios-other" | "android" | "desktop-safari" | "other";

export type InstallVariant = "prompt" | "ios-safari" | "ios-other" | "android-manual" | "desktop-safari" | "none";

export const DISMISS_MS = 2_592_000_000; // 30 days

export function detectInstallPlatform(env: { userAgent: string; maxTouchPoints: number }): InstallPlatform {
  const ua = env.userAgent;
  // iPadOS 13+ reports a Mac user agent; a Mac never has a touch screen, so touch points tell them apart.
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && env.maxTouchPoints > 2);
  if (ios) {
    return /CriOS|EdgiOS|FxiOS|OPT|YaBrowser|Ddg|Brave/.test(ua) ? "ios-other" : "ios-safari";
  }
  if (/Android/i.test(ua)) return "android";
  const version = /Version\/(\d+)/.exec(ua);
  if (
    ua.includes("Macintosh") &&
    env.maxTouchPoints === 0 &&
    version !== null &&
    Number(version[1]) >= 17 &&
    !/Chrome|Chromium|Firefox|Edg/.test(ua)
  ) {
    return "desktop-safari";
  }
  return "other";
}

export function installVariant(s: {
  platform: InstallPlatform;
  hasPrompt: boolean;
  installed: boolean;
  androidFallback: boolean;
}): InstallVariant {
  if (s.installed) return "none";
  if (s.hasPrompt) return "prompt";
  switch (s.platform) {
    case "ios-safari":
      return "ios-safari";
    case "ios-other":
      return "ios-other";
    case "desktop-safari":
      return "desktop-safari";
    case "android":
      return s.androidFallback ? "android-manual" : "none";
    case "other":
      return "none";
  }
}

export function showsBanner(variant: InstallVariant): boolean {
  return variant === "prompt" || variant === "ios-safari" || variant === "ios-other" || variant === "android-manual";
}

export function isDismissed(dismissedAt: number | null, now: number): boolean {
  return dismissedAt !== null && now - dismissedAt < DISMISS_MS;
}
