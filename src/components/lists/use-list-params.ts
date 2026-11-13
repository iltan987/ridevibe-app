"use client";

import { useSearchParams } from "next/navigation";
import { listSearch } from "@/lib/list-url";

type Values = Record<string, string | number | null | undefined>;
type Defaults = Record<string, string | number>;

/**
 * List state in the URL without a server round trip: reads `useSearchParams()`, writes through the native
 * History API (Next's router syncs `useSearchParams` with it). `window.location.pathname` keeps the locale prefix.
 */
export function useListParams() {
  const searchParams = useSearchParams();
  const write = (method: "pushState" | "replaceState", values: Values, defaults: Defaults) => {
    window.history[method](null, "", window.location.pathname + listSearch(values, defaults));
  };
  return {
    get: (key: string) => searchParams.get(key),
    push: (values: Values, defaults: Defaults) => write("pushState", values, defaults),
    replace: (values: Values, defaults: Defaults) => write("replaceState", values, defaults),
  };
}
