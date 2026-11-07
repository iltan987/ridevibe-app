import "server-only";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPathname, redirect } from "@/i18n/navigation";
import { getCurrentUser } from "./user";

export function isStaff(profile: { role: string; status: string } | null | undefined) {
  return profile?.status === "active" && (profile.role === "organizer" || profile.role === "admin");
}

/**
 * Gate for staff-only pages: signed-out users go to sign-in, everyone else who
 * isn't active staff gets a 404 (don't reveal that the page exists). The DB
 * enforces the same rule via RLS — this is only the UI side.
 */
export async function requireStaff(returnTo: Parameters<typeof getPathname>[0]["href"]) {
  const [user, locale] = await Promise.all([getCurrentUser(), getLocale()]);
  if (!user) {
    const next = getPathname({ href: returnTo, locale });
    return redirect({ href: { pathname: "/sign-in", query: { next } }, locale });
  }
  if (!isStaff(user.profile)) notFound();
  return user;
}
