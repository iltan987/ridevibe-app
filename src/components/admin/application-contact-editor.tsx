"use client";

import { Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { type SubmitEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { PhoneField } from "@/components/apply/phone-field";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { saveApplicationContact } from "@/lib/applications/review-actions";
import { type ApplicationFieldErrors, type ContactValues, validateContactChanges } from "@/lib/applications/schema";
import { formDataText } from "@/lib/form-data";

type Failure = "forbidden" | "invalid" | "duplicate" | "error";

/**
 * Phone/email rows of an application (server-rendered `children`) with an
 * "Edit" button that swaps them for a small form to correct name, phone and
 * email. Same rules as the public form; only changed fields are checked and
 * saved. The page re-renders with the new values after a save (refresh()).
 */
export function ApplicationContactEditor({
  application,
  emailLocked,
  children,
}: {
  application: ContactValues & { id: string };
  /** Approved application and no applications.decide: the DB refuses email changes. */
  emailLocked: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("Admin");
  const tApply = useTranslations("Apply");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [fieldErrors, setFieldErrors] = useState<ApplicationFieldErrors>({});
  const [failure, setFailure] = useState<Failure | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);

  // Back on the Edit button after Save/Cancel (the form is gone).
  useEffect(() => {
    if (!open && restoreFocus.current) {
      restoreFocus.current = false;
      editButton.current?.focus();
    }
  }, [open]);

  function close() {
    restoreFocus.current = true;
    setFieldErrors({});
    setFailure(null);
    setOpen(false);
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const values: ContactValues = {
      full_name: formDataText(formData, "full_name"),
      phone: formDataText(formData, "phone"),
      email: formDataText(formData, "email"),
    };
    setFailure(null);
    const checked = validateContactChanges(application, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      return;
    }
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveApplicationContact(application.id, values);
      if (result.status === "ok") close();
      else if ("fieldErrors" in result) setFieldErrors(result.fieldErrors);
      else setFailure(result.status);
    });
  }

  const error = (field: keyof ContactValues) => {
    const key = fieldErrors[field];
    return key ? tApply(`errors.${key}`) : undefined;
  };

  if (!open) {
    return (
      <div className="flex items-start justify-between gap-3">
        <dl className="flex min-w-0 flex-col gap-3">{children}</dl>
        <Button ref={editButton} variant="outline" size="sm" onClick={() => setOpen(true)}>
          <Pencil aria-hidden /> {t("contactEdit.edit")}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-busy={isPending}>
      <Field data-invalid={!!fieldErrors.full_name}>
        <FieldLabel htmlFor="contact-full_name">{tApply("fields.full_name")}</FieldLabel>
        <Input
          id="contact-full_name"
          name="full_name"
          defaultValue={application.full_name}
          maxLength={120}
          autoComplete="off"
          autoFocus
          aria-invalid={!!fieldErrors.full_name}
        />
        <FieldError>{error("full_name")}</FieldError>
      </Field>

      <PhoneField name="phone" label={tApply("fields.phone")} defaultValue={application.phone} error={error("phone")} />

      <Field data-invalid={!!fieldErrors.email}>
        <FieldLabel htmlFor="contact-email">{tApply("fields.email")}</FieldLabel>
        <Input
          id="contact-email"
          name="email"
          type="email"
          defaultValue={application.email}
          maxLength={254}
          autoComplete="off"
          readOnly={emailLocked}
          className={emailLocked ? "bg-muted text-muted-foreground dark:bg-muted" : undefined}
          aria-invalid={!!fieldErrors.email}
        />
        <FieldDescription>{t(emailLocked ? "contactEdit.emailLocked" : "contactEdit.emailHint")}</FieldDescription>
        <FieldError>{error("email")}</FieldError>
      </Field>

      {failure && (
        <p role="alert" className="text-sm text-destructive">
          {failure === "duplicate" ? t("contactEdit.duplicateEmail") : t(`accessErrors.${failure}`)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending}>
          {t("contactEdit.save")}
        </Button>
        <Button type="button" variant="outline" disabled={isPending} onClick={close}>
          {t("contactEdit.cancel")}
        </Button>
      </div>
    </form>
  );
}
