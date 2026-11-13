"use client";

import { useEffect, useState } from "react";
import { paramOff, syncedInput } from "@/lib/list-url";
import { parsePage } from "@/lib/pagination";
import { normalizeQuery } from "@/lib/search-fold";

/**
 * Search box and page of a list filtered in the browser (`?q=…&page=…`, read through `useListParams`). The box
 * follows the URL on back/forward and is never overwritten by the URL catching up with the typed text
 * (`docs/learnings/nextjs.md`, "URL as list state").
 */
export function useListSearch(params: {
  get: (key: string) => string | null;
  raw: (key: string) => string | string[] | null;
}) {
  const urlQuery = normalizeQuery(params.get("q"));
  // Repeated (`?page=2&page=3`) reads as an array: shown as page 1 and corrected, like on the server.
  const rawPage = params.raw("page");
  // Typing updates only the text (see syncedInput); the write to the URL shows in the same render (useListParams).
  const [search, setSearch] = useState({ url: urlQuery, input: urlQuery });
  const synced = syncedInput(search, urlQuery);
  if (synced !== search) setSearch(synced);
  const query = normalizeQuery(synced.input);

  return {
    /** The box text, as typed. */
    input: synced.input,
    /** The normalized search to filter by. */
    query,
    /** The URL's page (not clamped yet). */
    page: parsePage(rawPage),
    /** Updates the box. Returns the new normalized query when it changed (write it to the URL), else null. */
    type(value: string): string | null {
      setSearch((prev) => ({ ...prev, input: value }));
      const next = normalizeQuery(value);
      return next === query ? null : next;
    },
    /** True when the URL's `page` differs from the (clamped) page shown: malformed or out of range. */
    pageOff: (shown: number) => paramOff(rawPage, shown, 1),
  };
}

/** Replaces the URL's query string with `search` (from `listSearch`) when not null; the router syncs itself. */
export function useUrlFix(search: string | null) {
  useEffect(() => {
    if (search !== null) window.history.replaceState(null, "", window.location.pathname + search);
  }, [search]);
}

/** After a page change: brings the list's top into view when it is above the viewport. */
export function scrollToListTop(top: HTMLElement | null) {
  if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
}
