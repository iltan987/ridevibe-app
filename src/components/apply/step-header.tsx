"use client";

import { useTranslations } from "next-intl";
import type { Ref } from "react";
import { APPLY_STEPS, STEP_COUNT } from "@/lib/applications/steps";

/** "Adım 2/4 · Kulüp" and a thin progress bar. The heading gets focus on every step change (screen readers). */
export function StepHeader({ step, headingRef }: { step: number; headingRef: Ref<HTMLHeadingElement> }) {
  const t = useTranslations("Apply");
  const progress = t("progress", { step, total: STEP_COUNT });

  return (
    <div className="flex flex-col gap-3">
      <h2 id="apply-step-heading" ref={headingRef} tabIndex={-1} className="text-lg font-medium outline-none">
        <span className="text-muted-foreground">{progress} · </span>
        {t(`steps.${APPLY_STEPS[step - 1].id}`)}
      </h2>
      <div
        role="progressbar"
        aria-labelledby="apply-step-heading"
        aria-valuemin={1}
        aria-valuemax={STEP_COUNT}
        aria-valuenow={step}
        aria-valuetext={progress}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${(step / STEP_COUNT) * 100}%` }}
        />
      </div>
    </div>
  );
}
