"use client";

import { Link2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { sortByNameMatch } from "@/lib/applications/name-match";
import { findLinkableAccounts, type LinkableAccount, linkApplication } from "@/lib/applications/review-actions";
import { initials } from "@/lib/initials";

type Failure = "forbidden" | "invalid" | "error";

const SEARCH_DELAY_MS = 300;

/**
 * "Link to account": pick a pending account (e.g. the applicant signed in with
 * another Google account than the email on the form) and link the application
 * to it. Approved applications can also go to an active account without an
 * application (staff activated it before the application was matched); that
 * only attaches the application. Accounts whose name resembles the applicant's
 * come first on each page.
 */
export function LinkAccountDialog({
  applicationId,
  applicationName,
  approved,
}: {
  applicationId: string;
  applicationName: string;
  approved: boolean;
}) {
  const t = useTranslations("Admin");
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<LinkableAccount[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [selected, setSelected] = useState<LinkableAccount | null>(null);
  const [isLinking, startLinking] = useTransition();
  // Only the latest request may update the list (typing fires several).
  const latestRequest = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  async function load(search: string, cursor: string | null) {
    const request = ++latestRequest.current;
    setLoading(true);
    setFailure(null);
    let result: Awaited<ReturnType<typeof findLinkableAccounts>>;
    try {
      result = await findLinkableAccounts({ search, cursor, includeActive: approved });
    } catch {
      // Network failure / server error: the action throws instead of returning.
      result = { status: "error" };
    }
    if (request !== latestRequest.current) return;
    setLoading(false);
    if ("status" in result) {
      setFailure(result.status);
      return;
    }
    const page = sortByNameMatch(result.items, applicationName, (account) => account.full_name);
    setItems((previous) => (cursor ? [...previous, ...page] : page));
    setNextCursor(result.nextCursor);
    setLoaded(true);
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    clearTimeout(searchTimer.current);
    latestRequest.current++;
    setQuery("");
    setItems([]);
    setNextCursor(null);
    setLoaded(false);
    setLoading(false);
    setFailure(null);
    setSelected(null);
    if (next) void load("", null);
  }

  function onSearch(value: string) {
    setQuery(value);
    // Drop the previous search's cursor and any request still in flight
    // (e.g. "More"), so its late response can't append to the new list.
    latestRequest.current++;
    setLoading(false);
    setNextCursor(null);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void load(value, null), SEARCH_DELAY_MS);
  }

  function onLink() {
    if (!selected) return;
    setFailure(null);
    startLinking(async () => {
      const result = await linkApplication(applicationId, selected.id).catch(() => ({ status: "error" as const }));
      if (result.status === "ok") onOpenChange(false);
      else setFailure(result.status === "invalid" || result.status === "forbidden" ? result.status : "error");
    });
  }

  const accountName = (account: LinkableAccount) => account.full_name || account.email || "—";
  const failureMessage = failure && (
    <p role="alert" className="text-sm text-destructive">
      {failure === "invalid" ? t("link.invalid") : t(`accessErrors.${failure}`)}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" className="self-start" />}>
        <Link2 aria-hidden /> {t("link.open")}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-md">
        {selected ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("link.confirmTitle")}</DialogTitle>
              <DialogDescription>
                {t(selected.status === "active" ? "link.confirmActive" : "link.confirm", {
                  application: applicationName,
                  account: accountName(selected),
                })}
              </DialogDescription>
            </DialogHeader>
            {failureMessage}
            <DialogFooter>
              <Button variant="outline" disabled={isLinking} onClick={() => setSelected(null)}>
                {t("link.back")}
              </Button>
              <Button disabled={isLinking} onClick={onLink}>
                {t("link.submit")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("link.title")}</DialogTitle>
              <DialogDescription>{t(approved ? "link.descriptionApproved" : "link.description")}</DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="link-account-search">{t("link.search")}</FieldLabel>
              <Input
                id="link-account-search"
                type="search"
                value={query}
                onChange={(event) => onSearch(event.target.value)}
                maxLength={200}
                autoComplete="off"
              />
            </Field>
            <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1" aria-busy={loading}>
              {items.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {items.map((account) => (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setFailure(null);
                          setSelected(account);
                        }}
                        className="flex w-full items-center gap-3 rounded-lg border border-input p-2 text-left outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <Avatar className="size-10">
                          {account.avatar_url && (
                            <AvatarImage src={account.avatar_url} alt="" referrerPolicy="no-referrer" />
                          )}
                          <AvatarFallback>{initials(accountName(account))}</AvatarFallback>
                        </Avatar>
                        <span className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium">{account.full_name || "—"}</span>
                            {account.status === "active" && (
                              <Badge variant="secondary" className="shrink-0">
                                {t("link.activeMember")}
                              </Badge>
                            )}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {account.email ?? t("members.noEmail")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {t("link.signedUp", {
                              date: format.dateTime(new Date(account.created_at), { dateStyle: "medium" }),
                            })}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {loading && !items.length && (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              )}
              {loaded && !loading && !failure && !items.length && (
                <p className="text-sm text-muted-foreground">{t(approved ? "link.emptyApproved" : "link.empty")}</p>
              )}
              {nextCursor && (
                <Button
                  variant="outline"
                  className="self-start"
                  disabled={loading}
                  onClick={() => void load(query, nextCursor)}
                >
                  {t("link.more")}
                </Button>
              )}
            </div>
            {failureMessage}
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("link.close")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
