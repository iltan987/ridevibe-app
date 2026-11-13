import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // /auth/* are non-localized route handlers (e.g. the OAuth callback).
  if (request.nextUrl.pathname.startsWith("/auth/")) {
    return updateSession(request, NextResponse.next({ request }));
  }

  // next-intl falls back to Accept-Language when there is no cookie, which redirects first-time visitors (and
  // crawlers) away from "/". Pin the header to the default locale: without a header it sets the cookie on every first
  // visit. next-intl forwards its request headers (rewrite/next with { request: { headers } }), so every localized
  // page, layout and Server Action sees accept-language "tr", not the visitor's. updateSession keeps the original
  // request (it mutates request.cookies).
  const headers = new Headers(request.headers);
  headers.set("accept-language", routing.defaultLocale);
  const response = handleI18nRouting(new NextRequest(request, { headers }));

  return updateSession(request, response);
}

export const config = {
  // Match all pathnames except API/internal routes and files with an extension
  // (e.g. favicon.ico, manifest.webmanifest).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
