import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Gentle nudge for members without an emergency contact; the button scrolls to the section (same page). */
export function EmergencyPrompt() {
  const t = useTranslations("Profile.emergency");
  return (
    <Card className="ring-primary/40">
      <CardHeader>
        <CardTitle>{t("promptTitle")}</CardTitle>
        <CardDescription>{t("promptText")}</CardDescription>
      </CardHeader>
      <CardContent>
        <a href="#emergency" className={buttonVariants()}>
          {t("promptAction")}
        </a>
      </CardContent>
    </Card>
  );
}
