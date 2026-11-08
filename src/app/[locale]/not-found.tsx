import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-4 px-4 py-16">
      <h1 className="heading text-3xl">{t("title")}</h1>
      <p className="text-muted-foreground">{t("description")}</p>
      <Link href="/" className={buttonVariants({ variant: "outline" })}>
        {t("back")}
      </Link>
    </section>
  );
}
