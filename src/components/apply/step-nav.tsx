"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { isLastStep } from "@/lib/applications/steps";

/**
 * Status line and the buttons under a step: "Next" (submit button, so Enter in a text input also means "Next") or,
 * on the last step, "Submit application"; "Back" from step 2.
 */
export function StepNav({
  step,
  isPending,
  message,
  onBack,
}: {
  step: number;
  isPending: boolean;
  message: string | null;
  onBack: () => void;
}) {
  const t = useTranslations("Apply");

  return (
    <div className="flex flex-col gap-3">
      {message && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      {/* Phones: the main button on top, full width. From `sm`: side by side, "Back" on the left. */}
      <div className="flex flex-col gap-3 sm:flex-row-reverse sm:justify-end">
        <Button type="submit" size="lg" disabled={isPending} className="h-11 w-full sm:w-auto">
          {!isLastStep(step) ? t("next") : isPending ? t("submitting") : t("submit")}
        </Button>
        {step > 1 && (
          <Button type="button" variant="outline" size="lg" onClick={onBack} className="h-11 w-full sm:w-auto">
            {t("back")}
          </Button>
        )}
      </div>
    </div>
  );
}
