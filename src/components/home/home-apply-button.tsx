import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { HeroApplyForUser } from "@/components/apply/hero-apply";
import { HeroApplyGuess } from "@/components/apply/hero-apply-guess";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// One boundary: the fallback guesses from the session cookie; the result keeps the ad's UTM params.
export function HomeApplyButton({ className }: { className?: string }) {
  const t = useTranslations("Home");
  const classes = cn(buttonVariants({ size: "lg" }), className);
  return (
    <Suspense fallback={<HeroApplyGuess className={classes}>{t("apply")}</HeroApplyGuess>}>
      <HeroApplyForUser className={classes}>{t("apply")}</HeroApplyForUser>
    </Suspense>
  );
}
