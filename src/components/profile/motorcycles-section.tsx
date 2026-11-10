"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deleteMotorcycle } from "@/lib/members/actions";
import { formatMotorcycle } from "@/lib/members/format";
import { MotorcycleDialog } from "./motorcycle-dialog";
import { ActionStatus, useProfileAction } from "./use-profile-action";

export const MAX_MOTORCYCLES = 10;

type Item = { id: string; brand: string; model: string; cc: number | null };

/** The member's motorcycles: add, edit (dialog) and delete (confirm). */
export function MotorcyclesSection({ motorcycles }: { motorcycles: Item[] }) {
  const t = useTranslations("Profile");
  const { isPending, result, setResult, run } = useProfileAction();
  const [toDelete, setToDelete] = useState<Item | null>(null);
  const full = motorcycles.length >= MAX_MOTORCYCLES;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("motorcycles")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {motorcycles.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noMotorcycles")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {motorcycles.map((bike) => {
              const name = formatMotorcycle(bike);
              return (
                <li key={bike.id} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                  <span className="min-w-0 text-sm">{name}</span>
                  <div className="flex shrink-0 gap-1">
                    <MotorcycleDialog
                      motorcycle={bike}
                      trigger={
                        <Button type="button" variant="outline" size="icon" aria-label={t("editMotorcycleLabel", { name })}>
                          <Pencil aria-hidden />
                        </Button>
                      }
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label={t("deleteMotorcycleLabel", { name })}
                      onClick={() => {
                        setResult(null);
                        setToDelete(bike);
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-col items-start gap-2">
          <MotorcycleDialog
            trigger={
              <Button type="button" variant="outline" disabled={full}>
                <Plus aria-hidden /> {t("addMotorcycle")}
              </Button>
            }
          />
          {full && <p className="text-sm text-muted-foreground">{t("limitReached")}</p>}
          <ActionStatus result={toDelete ? null : result} showSaved={false} />
        </div>
      </CardContent>

      <AlertDialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteConfirm", { name: toDelete ? formatMotorcycle(toDelete) : "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={() => toDelete && run(() => deleteMotorcycle(toDelete.id), () => setToDelete(null))}
            >
              {t("confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
