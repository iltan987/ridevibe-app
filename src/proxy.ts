import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

export const config = {
  // Match all pathnames except API/internal routes and files with an extension
  // (e.g. favicon.ico, manifest.webmanifest).
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
