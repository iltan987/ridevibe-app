import type { Metadata } from "next";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { GoogleIcon } from "@/components/auth/google-icon";
import { ClubBadge } from "@/components/brand/club-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPathname, Link, redirect } from "@/i18n/navigation";
import { signInWithGoogle } from "@/lib/auth/actions";
import { safeNextPath } from "@/lib/auth/safe-next";
import { getCurrentUser } from "@/lib/auth/user";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Auth");
  return { title: t("signInTitle"), robots: { index: false } };
}

export default function SignInPage({ searchParams }: PageProps<"/[locale]/sign-in">) {
  const t = useTranslations("Auth");
  const tFooter = useTranslations("Footer");

  return (
    <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <Card>
        <CardHeader>
          <ClubBadge sizes="96px" className="mx-auto mb-2 w-24" />
          <CardTitle className="heading text-center text-2xl">{t("signInTitle")}</CardTitle>
          <CardDescription className="text-center">{t("signInDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Suspense fallback={<Skeleton className="h-9 w-full" />}>
            <SignInForm searchParams={searchParams} />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            {t("notice")}{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              {tFooter("privacy")}
            </Link>
          </p>
        </CardContent>
        <CardFooter className="gap-1 text-sm">
          {t("notMember")}
          <Link href="/apply" className="font-medium underline underline-offset-4">
            {t("applyLink")}
          </Link>
        </CardFooter>
      </Card>
    </section>
  );
}

async function SignInForm({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/sign-in">["searchParams"];
}) {
  const [params, locale, user, t] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentUser(),
    getTranslations("Auth"),
  ]);

  if (user) return redirect({ href: "/account", locale });

  const next = safeNextPath(params.next, getPathname({ href: "/account", locale }));

  return (
    <form action={signInWithGoogle} className="flex flex-col gap-3">
      {params.error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      )}
      <input type="hidden" name="next" value={next} />
      <Button type="submit" size="lg" variant="outline" className="w-full">
        <GoogleIcon />
        {t("continueWithGoogle")}
      </Button>
    </form>
  );
}
