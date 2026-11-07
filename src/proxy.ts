import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // /auth/* are non-localized route handlers (e.g. the OAuth callback).
  const response = request.nextUrl.pathname.startsWith("/auth/")
    ? NextResponse.next({ request })
    : handleI18nRouting(request);

  return updateSession(request, response);
}

export const config = {
  // Match all pathnames except API/internal routes and files with an extension
  // (e.g. favicon.ico, manifest.webmanifest).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
