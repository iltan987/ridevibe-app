import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import { can, type Permission } from "./permissions";
import { type CurrentUser, getCurrentUser } from "./user";

type Href = Parameters<typeof getPathname>[0]["href"];

/**
 * Gate for staff pages: signed-out users go to sign-in, everyone else without
 * the required access gets a 404 (don't reveal that the page exists). The DB
 * enforces the same rules via RLS — this is only the UI side.
 */
export async function requireAccess(returnTo: Href, allowed: (user: CurrentUser) => boolean | Promise<boolean>) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) {
    const next = getPathname({ href: returnTo, locale });
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }
  if (!(await allowed(user))) notFound();
  return user;
}

export function requirePermission(permission: Permission, returnTo: Href) {
  return requireAccess(returnTo, (user) => can(user.access, permission));
}

export function requireAdmin(returnTo: Href) {
  return requireAccess(returnTo, (user) => user.access.isAdmin);
}
