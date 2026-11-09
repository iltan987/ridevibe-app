"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { chromeIntentUrl, detectInAppBrowser, isAndroid } from "@/lib/auth/in-app-browser";

const subscribe = () => () => {};
const getUserAgent = () => navigator.userAgent;
const getServerUserAgent = () => "";

/** Google blocks OAuth in social apps' embedded browsers; tell the visitor how to leave before they hit the 403. */
export function InAppBrowserNotice() {
  const t = useTranslations("Auth.inApp");
  const userAgent = useSyncExternalStore(subscribe, getUserAgent, getServerUserAgent);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const app = detectInAppBrowser(userAgent);
  if (!app) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
    } catch {
      return;
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div role="alert" className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
      <p className="font-medium">{t("title", { app })}</p>
      <p className="text-muted-foreground">{t("body")}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          {copied ? t("copied") : t("copy")}
        </Button>
        {isAndroid(userAgent) && (
          <a href={chromeIntentUrl(location.href)} className={buttonVariants({ size: "sm" })}>
            {t("openChrome")}
          </a>
        )}
      </div>
    </div>
  );
}
