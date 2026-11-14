"use client";

import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { whatsAppUrl } from "@/lib/applications/contact";
import { bloodTypeLabel } from "@/lib/members/blood-type";
import { formatMotorcycle } from "@/lib/members/format";
import { getSafetyCard, type SafetyCardResult } from "@/lib/members/safety-card";

/**
 * Emergency card of one member (members.safety). Fetched when the dialog opens, kept in component state only and
 * dropped on close; every fetch is access-logged server-side, so nothing is prefetched or cached here.
 */
export function SafetyCardDialog({ memberId, memberName }: { memberId: string; memberName: string }) {
  const t = useTranslations("Members.safety");
  const tr = useTranslations("Profile.emergency.relationships");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SafetyCardResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const request = useRef(0);

  function load() {
    const id = ++request.current;
    setResult(null);
    startTransition(async () => {
      const next = await getSafetyCard(memberId).catch((): SafetyCardResult => ({ status: "error" }));
      if (id === request.current) setResult(next);
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      load();
    } else {
      request.current++;
      setResult(null);
    }
  }

  const card = result?.status === "ok" ? result.card : null;
  const contacts = card ? [...card.contacts].sort((a, b) => a.position - b.position) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" aria-label={t("openLabel", { name: memberName })} />}>
        {t("open")}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-busy={isPending}
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription className="font-medium text-foreground">{memberName}</DialogDescription>
        </DialogHeader>

        {isPending && !result && (
          <p role="status" className="text-muted-foreground">
            {t("loading")}
          </p>
        )}

        {result?.status === "error" && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-destructive">{t("error")}</p>
            <Button variant="outline" size="sm" onClick={load}>
              {t("retry")}
            </Button>
          </div>
        )}
        {result?.status === "forbidden" && <p role="alert">{t("forbidden")}</p>}
        {result?.status === "notActive" && <p role="alert">{t("notActive")}</p>}

        {card && (
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{t("contacts")}</h3>
              {contacts.length === 0 ? (
                <p className="text-muted-foreground">{t("noContacts")}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {contacts.map((contact) => (
                    <li key={contact.position} className="flex flex-col gap-2 rounded-lg border p-3">
                      <div>
                        <p className="font-medium">{contact.name}</p>
                        <p className="text-xs text-muted-foreground">{tr(contact.relationship)}</p>
                        <p className="tabular-nums">{contact.phone}</p>
                      </div>
                      <div className="flex gap-2">
                        <a href={`tel:${contact.phone}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                          {t("call")}
                        </a>
                        <a
                          href={whatsAppUrl(contact.phone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "outline", size: "sm" })}
                        >
                          {t("whatsapp")}
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="font-medium">{t("bloodType")}</h3>
              <p>{card.bloodType ? bloodTypeLabel(card.bloodType) : t("bloodTypeUnknown")}</p>
            </section>

            <section className="flex flex-col gap-1">
              <h3 className="font-medium">{t("motorcycles")}</h3>
              {card.motorcycles.length === 0 ? (
                <p className="text-muted-foreground">{t("noMotorcycles")}</p>
              ) : (
                <ul className="flex flex-col">
                  {card.motorcycles.map((bike, i) => (
                    <li key={i}>{formatMotorcycle(bike)}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
