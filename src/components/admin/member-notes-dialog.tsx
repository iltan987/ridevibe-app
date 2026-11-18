"use client";

import { NotebookPen } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { addMemberNote, deleteMemberNote, listMemberNotes, type MemberNote } from "@/lib/members/notes";
import { NOTE_MAX_LENGTH } from "@/lib/members/notes-schema";

type Failure = "forbidden" | "invalid" | "error";

/** Staff notes about one member: newest first, add for everyone with members.notes, delete for admins only. */
export function MemberNotesDialog({
  memberId,
  memberName,
  count,
  canDelete,
}: {
  memberId: string;
  memberName: string;
  count: number;
  canDelete: boolean;
}) {
  const t = useTranslations("Admin.notes");
  const tErrors = useTranslations("Admin.accessErrors");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<MemberNote[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [body, setBody] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  // Only the latest load may set the list (open, add and delete each reload).
  const latestLoad = useRef(0);

  async function load() {
    const request = ++latestLoad.current;
    const result = await listMemberNotes(memberId).catch(() => ({ status: "error" as const }));
    if (request !== latestLoad.current) return;
    if (result.status === "ok") {
      setNotes(result.notes);
      setLoadFailed(false);
    } else {
      setLoadFailed(true);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    setBody("");
    setFailure(null);
    setConfirmId(null);
    if (next) {
      setNotes(null);
      setLoadFailed(false);
      void load();
    } else {
      latestLoad.current++;
    }
  }

  function run(action: () => ReturnType<typeof addMemberNote>, onDone?: () => void) {
    setFailure(null);
    startSaving(async () => {
      const result = await action().catch(() => ({ status: "error" as const }));
      if (result.status === "ok") {
        onDone?.();
        await load();
      } else if (result.status === "forbidden" || result.status === "invalid") {
        setFailure(result.status);
      } else {
        setFailure("error");
      }
      setConfirmId(null);
    });
  }

  function onSubmit(event: React.SubmitEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    const form = new FormData();
    form.set("body", body);
    run(
      () => addMemberNote(memberId, form),
      () => setBody(""),
    );
  }

  const inputId = `member-note-${memberId}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <NotebookPen aria-hidden /> {count > 0 ? t("openCount", { count }) : t("open")}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title", { name: memberName || "—" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[40vh] overflow-y-auto">
          {loadFailed ? (
            <p role="alert" className="text-sm text-destructive">
              {t("loadError")}
            </p>
          ) : notes === null ? (
            <div className="flex flex-col gap-2" role="status" aria-label={t("loading")}>
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notes.map((note) => (
                <li key={note.id} className="rounded-lg border p-3 text-sm">
                  <p className="text-xs text-muted-foreground">
                    {note.authorName ?? t("unknownAuthor")} ·{" "}
                    {format.dateTime(new Date(note.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                  <p className="mt-1 wrap-break-word whitespace-pre-wrap">{note.body}</p>
                  {canDelete &&
                    (confirmId === note.id ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-xs">{t("deleteConfirm")}</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={isSaving}
                          onClick={() => run(() => deleteMemberNote(note.id))}
                        >
                          {t("deleteYes")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSaving}
                          onClick={() => setConfirmId(null)}
                        >
                          {t("deleteCancel")}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        disabled={isSaving}
                        onClick={() => setConfirmId(note.id)}
                      >
                        {t("delete")}
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>

        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor={inputId}>{t("label")}</FieldLabel>
            <Textarea
              id={inputId}
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                setFailure(null);
              }}
              maxLength={NOTE_MAX_LENGTH}
              disabled={isSaving}
            />
            <FieldDescription>{t("hint")}</FieldDescription>
          </Field>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {tErrors(failure)}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("close")}
            </Button>
            <Button type="submit" disabled={isSaving || !body.trim()}>
              {t("add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
