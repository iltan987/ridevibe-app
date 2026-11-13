import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // next-intl falls back to Accept-Language when there is no cookie, which redirects first-time visitors (and
  // crawlers) away from "/". Hide the header from it only; updateSession keeps the original request (it mutates
  // request.cookies).
  const headers = new Headers(request.headers);
  headers.delete("accept-language");
  const i18nRequest = new NextRequest(request, { headers });

  // /auth/* are non-localized route handlers (e.g. the OAuth callback).
  const response = request.nextUrl.pathname.startsWith("/auth/")
    ? NextResponse.next({ request })
    : handleI18nRouting(i18nRequest);

  return updateSession(request, response);
}

export const config = {
  // Match all pathnames except API/internal routes and files with an extension
  // (e.g. favicon.ico, manifest.webmanifest).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
