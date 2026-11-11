"use client";

import { themeInitScript } from "@/lib/theme";

// Runs synchronously while <head> is parsed, so the stored theme is applied before first paint
// (the server always renders the dark default; see docs/learnings/ui.md).
// A client component on purpose: when React creates this element on the client (a language switch remounts the
// [locale] layout; a client-rendered 404) it must be an inert `text/plain` block, or React logs "Encountered a script
// tag". Only the server HTML carries the executable type; suppressHydrationWarning keeps it during hydration.
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: themeInitScript }}
    />
  );
}
