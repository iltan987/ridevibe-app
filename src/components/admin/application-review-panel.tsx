"use client";

import { MessageCircle, TriangleAlert, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, useState, useTransition } from "react";
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
import { LinkAccountDialog } from "@/components/admin/link-account-dialog";
import { useRouter } from "@/i18n/navigation";
import type { AccessActionResult } from "@/lib/access/actions";
import { sameEmail } from "@/lib/applications/contact";
import type { ApplicationAccount, ApplicationStatus } from "@/lib/applications/queries";
import { deleteApplication, saveApplicationNotes, setApplicationStatus } from "@/lib/applications/review-actions";
import { formDataText } from "@/lib/form-data";

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
  linked,
  retainedLabel,
  account,
  inviteHref,
  canLink,
}: {
  application: { id: string; status: ApplicationStatus; name: string; email: string; notes: string | null };
  canReview: boolean;
  canDecide: boolean;
  canDelete: boolean;
  /** "Name · date" of the last status change, if any. */
  decidedLabel: string | null;
  /** The application is linked to an account (profile_id, any status). */
  linked: boolean;
  /** Kept application of a former member (unlinked by the nightly purge): shown instead of the account block. */
  retainedLabel: string | null;
  /** The linked account (application_account RPC); null when unlinked, or linked to an account staff can't see (being deleted). */
  account: ApplicationAccount | null;
  /** WhatsApp link with the invite text (approved applications only). */
  inviteHref: string | null;
  /** applications.decide, and the application is neither linked nor rejected. */
  canLink: boolean;
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
      run(
        "status",
        () => deleteApplication(id),
        () => router.replace("/admin/applications"),
      );
    } else {
      const next = confirm.kind === "reopen" ? "contacted" : confirm.kind;
      run(
        "status",
        () => setApplicationStatus(id, next),
        () => setConfirm(null),
      );
    }
  }

  function onSaveNotes(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const notes = formDataText(new FormData(event.currentTarget), "notes");
    run("notes", () => saveApplicationNotes(id, notes));
  }

  // Which account an approval activates: anyone signed in can submit someone
  // else's name and phone, so show the sign-in email and flag a mismatch.
  const accountName = account ? [account.fullName, account.email].filter(Boolean).join(" · ") : "";
  const linkedLabel = linked
    ? accountName
      ? t("review.account", { account: accountName })
      : t("review.linkedUnknown")
    : null;
  const mismatchedEmail = account?.email && !sameEmail(application.email, account.email) ? account.email : null;
  // In the approve dialog, the email identifies the account best.
  const dialogAccount = account?.email || account?.fullName || "";

  const message = (what: "status" | "notes") =>
    result?.what === what &&
    (result.status === "ok" ? (
      what === "notes" && <p className="text-sm text-muted-foreground">{t("review.saved")}</p>
    ) : (
      <p role="alert" className="text-sm text-destructive">
        {t(`accessErrors.${result.status}`)}
      </p>
    ));

  const dialog =
    confirm &&
    {
      approved: {
        title: t("review.approveTitle"),
        body: !linked
          ? t("review.approveBody", { name: application.name, email: application.email })
          : !dialogAccount
            ? t("review.approveBodyLinkedUnknown", { name: application.name })
            : account?.status === "inactive"
              ? t("review.approveBodyLinkedInactive", { account: dialogAccount })
              : t("review.approveBodyLinked", { name: application.name, account: dialogAccount }),
      },
      rejected: { title: t("review.rejectTitle"), body: t("review.rejectBody", { name: application.name }) },
      reopen: { title: t("review.reopen"), body: t("review.reopenBody") },
      delete: { title: t("review.deleteTitle"), body: t("review.deleteBody") },
    }[confirm.kind];

  return (
    <Card aria-busy={isPending} data-skeleton-result="detail-review">
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
                <Button
                  variant="outline"
                  className="text-destructive"
                  disabled={isPending}
                  onClick={() => setConfirm({ kind: "rejected" })}
                >
                  {t("review.reject")}
                </Button>
              </>
            )}
            {decided && canDecide && !retainedLabel && (
              <Button variant="outline" disabled={isPending} onClick={() => setConfirm({ kind: "reopen" })}>
                {t("review.reopen")}
              </Button>
            )}
          </div>
          {!canEditNotes && <p className="text-sm text-muted-foreground">{t("review.noPermission")}</p>}
          {message("status")}
        </div>

        {/* Account: linked state, or invite (approved) and "Link to account" */}
        {!retainedLabel && (linkedLabel || status === "approved" || canLink) && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
            {linkedLabel ? (
              <>
                <p className="text-sm font-medium wrap-anywhere">{linkedLabel}</p>
                {mismatchedEmail && (
                  <p
                    role="note"
                    className="flex gap-2 rounded-lg border border-sun/40 bg-sun/10 p-3 text-sm wrap-anywhere"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {t(decided ? "review.emailMismatchDecided" : "review.emailMismatch", {
                        appEmail: application.email,
                        accountEmail: mismatchedEmail,
                      })}
                    </span>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {/* Only those who can link get pointed to "Link to account". */}
                {t(
                  status === "approved" ? (canLink ? "review.notLinked" : "review.notLinkedNoLink") : "link.notLinked",
                )}
              </p>
            )}
            {(inviteHref || canLink) && (
              <div className="flex flex-wrap gap-2">
                {inviteHref && (
                  <a href={inviteHref} target="_blank" rel="noreferrer" className={buttonVariants()}>
                    <MessageCircle aria-hidden /> {t("review.sendInvite")}
                  </a>
                )}
                {canLink && (
                  <LinkAccountDialog
                    applicationId={id}
                    applicationName={application.name}
                    approved={status === "approved"}
                  />
                )}
              </div>
            )}
          </div>
        )}

        {retainedLabel && (
          <p className="rounded-lg border bg-muted/30 p-3 text-sm font-medium wrap-anywhere">{retainedLabel}</p>
        )}

        {/* Notes */}
        {canEditNotes ? (
          <form onSubmit={onSaveNotes} className="flex flex-col gap-2">
            <Field>
              <FieldLabel htmlFor="admin-notes">{t("review.notes")}</FieldLabel>
              <Textarea
                id="admin-notes"
                name="notes"
                defaultValue={application.notes ?? ""}
                maxLength={4000}
                rows={4}
              />
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
          <Button
            variant="ghost"
            className="self-start text-destructive"
            disabled={isPending}
            onClick={() => setConfirm({ kind: "delete" })}
          >
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
