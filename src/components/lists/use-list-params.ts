"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { addWrite, listSearch, type PendingWrite, rawParam, shownSearch } from "@/lib/list-url";

type Values = Record<string, string | number | null | undefined>;
type Defaults = Record<string, string | number>;

/**
 * List state in the URL without a server round trip: reads `useSearchParams()`, writes through the native
 * History API (Next's router syncs `useSearchParams` with it). `window.location.pathname` keeps the locale prefix.
 * The router syncs in a transition (a frame later on screen), so until it catches up the hook reads its own last
 * write (`shownSearch`): a chip or page tap changes the list in the same frame, like typing.
 */
export function useListParams() {
  const routerSearch = useSearchParams().toString();
  const [pending, setPending] = useState<PendingWrite | null>(null);
  // The router caught up or moved elsewhere: drop the write (store-previous-value pattern).
  if (pending && !pending.from.includes(routerSearch)) setPending(null);
  // Back/forward before the router caught up (it may land on a URL the write started from): the history entry wins.
  useEffect(() => {
    const drop = () => setPending(null);
    window.addEventListener("popstate", drop);
    return () => window.removeEventListener("popstate", drop);
  }, []);
  const params = new URLSearchParams(shownSearch(routerSearch, pending));

  const write = (method: "pushState" | "replaceState", values: Values, defaults: Defaults) => {
    const search = listSearch(values, defaults);
    window.history[method](null, "", window.location.pathname + search);
    setPending((previous) => addWrite(previous, routerSearch, search));
  };
  return {
    get: (key: string) => params.get(key),
    /** Like the page's `searchParams`: an array when the key is repeated. */
    raw: (key: string) => rawParam(params, key),
    push: (values: Values, defaults: Defaults) => write("pushState", values, defaults),
    replace: (values: Values, defaults: Defaults) => write("replaceState", values, defaults),
  };
}
