"use client"; // Error boundaries must be Client Components

import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

// Catches errors in pages below the locale layout, so the header, nav, theme and language stay intact.
// Errors in the layout itself fall through to Next's built-in page (the layout path doesn't throw:
// getCurrentUser() turns Supabase errors into null).
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Error");
  // Server errors carry a digest that matches the Vercel log entry; the message is hidden in production.
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : null;

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-4 px-4 py-16">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => retry()}>{t("retry")}</Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          {t("back")}
        </Link>
      </div>
      {digest && <p className="text-xs text-muted-foreground">{t("code", { digest })}</p>}
    </section>
  );
}
