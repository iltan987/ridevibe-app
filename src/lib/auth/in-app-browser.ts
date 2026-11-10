export type InAppBrowser = "Instagram" | "Facebook" | "TikTok" | "LinkedIn";

/** Social apps' embedded browsers, where Google blocks OAuth sign-in. Null for normal browsers. */
export function detectInAppBrowser(userAgent: string): InAppBrowser | null {
  if (/Instagram/.test(userAgent)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/.test(userAgent)) return "Facebook";
  if (/musical_ly|BytedanceWebview|TikTok/i.test(userAgent)) return "TikTok";
  if (/LinkedInApp/.test(userAgent)) return "LinkedIn";
  return null;
}

export function isAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/** Android intent link that opens the URL in Chrome, falling back to the plain URL. */
export function chromeIntentUrl(url: string): string {
  const { host, pathname, search } = new URL(url);
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
