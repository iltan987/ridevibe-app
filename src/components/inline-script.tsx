"use client";

// An inline script that runs only from the server HTML (during parsing, before first paint). When React creates the
// element on the client (a language switch remounts the [locale] layout; a client-rendered 404; a Suspense fallback
// shown again) it is an inert `text/plain` block, otherwise React logs "Encountered a script tag". A client component
// on purpose: a server component always sees `window` as undefined. Pattern from the Next docs
// (`preventing-flash-before-hydration.md`); see docs/learnings/ui.md.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
