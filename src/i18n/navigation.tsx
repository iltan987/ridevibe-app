import type { ComponentProps } from "react";
import { createNavigation } from "next-intl/navigation";
import { LinkPending } from "@/components/layout/link-pending";
import { routing } from "./routing";

const navigation = createNavigation(routing);

// Locale-aware wrappers around Next.js navigation APIs. Use these instead of
// `next/link` and `next/navigation` so links keep the current language.
export const { redirect, usePathname, useRouter, getPathname } = navigation;

// Same as next-intl's Link, plus a pending marker (see LinkPending).
export function Link({
  children,
  ...props
}: ComponentProps<typeof navigation.Link>) {
  return (
    <navigation.Link {...props}>
      {children}
      <LinkPending />
    </navigation.Link>
  );
}
