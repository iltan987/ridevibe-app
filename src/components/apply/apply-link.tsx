"use client";

import { useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";
import { Link } from "@/i18n/navigation";
import { UTM_KEYS } from "@/lib/applications/options";

// Link to /apply that carries the ad's UTM parameters from the current URL.
// Attribution without cookies or storage, so no consent banner is needed.
export function ApplyLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  const searchParams = useSearchParams();
  const query = Object.fromEntries(
    UTM_KEYS.flatMap((key) => {
      const value = searchParams.get(key);
      return value ? [[key, value]] : [];
    }),
  );
  return <Link href={{ pathname: "/apply", query }} {...props} />;
}
