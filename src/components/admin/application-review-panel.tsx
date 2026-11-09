"use client";

import { MessageCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "@/i18n/navigation";
import type { AccessActionResult } from "@/lib/access/actions";
import type { ApplicationStatus } from "@/lib/applications/queries";
import { deleteApplication, saveApplicationNotes, setApplicationStatus } from "@/lib/applications/review-actions";

const STATUS_BADGE: Partial<Record<ApplicationStatus, "default" | "status">> = {
  new: "default",
  approved: "status",
};

type Confirm = { kind: "approved" | "rejected" | "reopen" | "delete" } | null;

export function ApplicationReviewPanel({
  application,
  canReview,
  canDecide,
  canDelete,
  decidedLabel,
  linkedMemberLabel,
  inviteHref,
}: {
  application: { id: string; status: ApplicationStatus; name: string; email: string; notes: string | null };
  canReview: boolean;
  canDecide: boolean;
  canDelete: boolean;
  /** "Name · date" of the last status change, if any. */
  decidedLabel: string | null;
  /** Set once the approved application is linked to a member account. */
  linkedMemberLabel: string | null;
  /** wa.me link with the invite text (approved applications only). */
  inviteHref: string | null;
}) {
  const t = useTranslations("Admin");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ status: AccessActionResult["status"]; what: "status" | "notes" } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const { id, status } = application;
  const decided = status === "approved" || status === "rejected";
  const canEditNotes = canReview || canDecide; // decide includes review (RLS)

  function run(what: "status" | "notes", action: () => Promise<AccessActionResult>, onOk?: () => void) {
    setResult(null);
    startTransition(async () => {
      const r = await action();
      setResult({ status: r.status, what });
      if (r.status === "ok") onOk?.();
    });
  }

  function onConfirm() {
    if (!confirm) return;
    if (confirm.kind === "delete") {
      run("status", () => deleteApplication(id), () => router.replace("/admin/applications"));
    } else {
      const next = confirm.kind === "reopen" ? "contacted" : confirm.kind;
      run("status", () => setApplicationStatus(id, next), () => setConfirm(null));
    }
  }

  function onSaveNotes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const notes = String(new FormData(event.currentTarget).get("notes") ?? "");
    run("notes", () => saveApplicationNotes(id, notes));
  }

  const message = (what: "status" | "notes") =>
    result?.what === what &&
    (result.status === "ok" ? (
      what === "notes" && <p className="text-sm text-muted-foreground">{t("review.saved")}</p>
    ) : (
      <p role="alert" className="text-sm text-destructive">
        {t(`accessErrors.${result.status}`)}
      </p>
    ));

  const dialog = confirm && {
    approved: { title: t("review.approveTitle"), body: t("review.approveBody", { name: application.name, email: application.email }) },
    rejected: { title: t("review.rejectTitle"), body: t("review.rejectBody", { name: application.name }) },
    reopen: { title: t("review.reopen"), body: t("review.reopenBody") },
    delete: { title: t("review.deleteTitle"), body: t("review.deleteBody") },
  }[confirm.kind];

  return (
    <Card aria-busy={isPending}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {t("review.title")}
          <Badge variant={STATUS_BADGE[status] ?? "secondary"}>{t(`statuses.${status}`)}</Badge>
        </CardTitle>
        {decidedLabel && <p className="text-xs text-muted-foreground">{decidedLabel}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {/* Status actions */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {!decided && canEditNotes && (
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => run("status", () => setApplicationStatus(id, status === "new" ? "contacted" : "new"))}
              >
                {status === "new" ? t("review.markContacted") : t("review.backToNew")}
              </Button>
            )}
            {!decided && canDecide && (
              <>
                <Button disabled={isPending} onClick={() => setConfirm({ kind: "approved" })}>
                  {t("review.approve")}
                </Button>
                <Button variant="outline" className="text-destructive" disabled={isPending} onClick={() => setConfirm({ kind: "rejected" })}>
                  {t("review.reject")}
                </Button>
              </>
            )}
            {decided && canDecide && (
              <Button variant="outline" disabled={isPending} onClick={() => setConfirm({ kind: "reopen" })}>
                {t("review.reopen")}
              </Button>
            )}
          </div>
          {!canEditNotes && !canDecide && <p className="text-sm text-muted-foreground">{t("review.noPermission")}</p>}
          {message("status")}
        </div>

        {/* After approval: invite + link state */}
        {status === "approved" && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            {linkedMemberLabel ? (
              <p className="text-sm font-medium">{linkedMemberLabel}</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t("review.notLinked")}</p>
                {inviteHref && (
                  <a href={inviteHref} target="_blank" rel="noreferrer" className={buttonVariants({ className: "self-start" })}>
                    <MessageCircle aria-hidden /> {t("review.sendInvite")}
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {/* Notes */}
        {canEditNotes ? (
          <form onSubmit={onSaveNotes} className="flex flex-col gap-2">
            <Field>
              <FieldLabel htmlFor="admin-notes">{t("review.notes")}</FieldLabel>
              <Textarea id="admin-notes" name="notes" defaultValue={application.notes ?? ""} maxLength={4000} rows={4} />
              <FieldDescription>{t("review.notesHint")}</FieldDescription>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="outline" disabled={isPending}>
                {t("review.saveNotes")}
              </Button>
              {message("notes")}
            </div>
          </form>
        ) : (
          application.notes && (
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">{t("review.notes")}</p>
              <p className="text-sm whitespace-pre-wrap">{application.notes}</p>
            </div>
          )
        )}

        {canDelete && (
          <Button variant="ghost" className="self-start text-destructive" disabled={isPending} onClick={() => setConfirm({ kind: "delete" })}>
            <Trash2 aria-hidden /> {t("review.delete")}
          </Button>
        )}
      </CardContent>

      <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialog?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          {result?.what === "status" && result.status !== "ok" && message("status")}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("review.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm?.kind === "approved" || confirm?.kind === "reopen" ? "default" : "destructive"}
              disabled={isPending}
              onClick={onConfirm}
            >
              {t("review.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
