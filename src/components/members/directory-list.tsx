"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useListParams } from "@/components/lists/use-list-params";
import { MemberCard } from "@/components/members/member-card";
import { PagerButtons } from "@/components/pager-buttons";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { listSearch, syncedInput } from "@/lib/list-url";
import { directoryView } from "@/lib/members/directory-view";
import type { DirectoryMember, IstanbulSide } from "@/lib/members/queries";
import { parsePage } from "@/lib/pagination";
import { foldSearch, normalizeQuery, SEARCH_MAX_LENGTH } from "@/lib/search-fold";

const SIDES: IstanbulSide[] = ["asian", "european"];
const DEFAULTS = { page: 1 };

/**
 * The member directory in the browser: search, side chips and pages over the full list from the server, with the
 * state in the URL (`?q=…&side=…&page=…`, defaults left out). Typing replaces the history entry, chips and pages push
 * one; nothing goes to the server. The SSR pass reads the same URL, so a shared link arrives filtered.
 * `filtered` = a safety filter is active (empty-state copy); `children` (the safety filters) sit above the list.
 */
export function DirectoryList({
  members,
  safety,
  overCeiling,
  filtered,
  children,
}: {
  members: DirectoryMember[];
  safety: boolean;
  overCeiling: boolean;
  filtered: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("Members");
  const params = useListParams();
  const urlQuery = normalizeQuery(params.get("q"));
  const side = SIDES.find((s) => s === params.get("side")) ?? null;
  const rawPage = params.get("page");
  const blood = params.get("blood");
  const noContact = params.get("noContact");

  // The box follows the URL on back/forward; typing updates only the text (see syncedInput).
  const [search, setSearch] = useState({ url: urlQuery, input: urlQuery });
  const synced = syncedInput(search, urlQuery);
  if (synced !== search) setSearch(synced);
  const query = normalizeQuery(synced.input);
  // A search change writes the URL without `page`, but useSearchParams catches up a render later: until then the
  // URL still holds the old search and page, so show page 1 of the new search.
  const settled = query === urlQuery;

  const folded = members.map((member) => foldSearch(member.fullName));
  const view = directoryView(members, folded, { query, side, page: settled ? parsePage(rawPage) : 1 });

  const urlValues = (changes: Record<string, string | number | null>) => ({
    q: query,
    side,
    page: view.page,
    blood,
    noContact,
    ...changes,
  });

  // A malformed or out-of-range ?page= renders the clamped page; correct the URL to match (the router syncs itself).
  const fixedSearch =
    settled && rawPage !== (view.page === 1 ? null : String(view.page)) ? listSearch(urlValues({}), DEFAULTS) : null;
  useEffect(() => {
    if (fixedSearch !== null) window.history.replaceState(null, "", window.location.pathname + fixedSearch);
  }, [fixedSearch]);

  const listTop = useRef<HTMLDivElement>(null);

  function onSearch(value: string) {
    setSearch((prev) => ({ ...prev, input: value }));
    const next = normalizeQuery(value);
    if (next !== query) params.replace(urlValues({ q: next, page: null }), DEFAULTS);
  }

  function onSide(next: IstanbulSide | null) {
    if (next !== side) params.push(urlValues({ side: next, page: null }), DEFAULTS);
  }

  function onPage(next: number) {
    if (next === view.page) return;
    params.push(urlValues({ page: next }), DEFAULTS);
    const top = listTop.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  }

  const chips: { side: IstanbulSide | null; label: string; count: number }[] = [
    { side: null, label: t("sides.all"), count: view.counts.all },
    { side: "asian", label: t("sides.asian"), count: view.counts.asian },
    { side: "european", label: t("sides.european"), count: view.counts.european },
  ];

  return (
    <>
      <div data-skeleton-result="members-total" className="flex min-h-5 items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">{t("total", { count: view.counts.all })}</p>
        <Link href="/account" className="font-medium text-accent-text hover:underline">
          {t("editProfile")}
        </Link>
      </div>

      {overCeiling && (
        <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          {t("ceiling")}
        </p>
      )}

      {/* Filters as you type; the GET fields only matter without JavaScript. */}
      <form role="search" data-skeleton-result="members-search" className="flex" onSubmit={(e) => e.preventDefault()}>
        {side && <input type="hidden" name="side" value={side} />}
        {blood && <input type="hidden" name="blood" value={blood} />}
        {noContact && <input type="hidden" name="noContact" value={noContact} />}
        <Input
          name="q"
          type="search"
          value={synced.input}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      </form>

      <div data-skeleton-result="members-chips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((chip) => (
          <button
            key={chip.side ?? "all"}
            type="button"
            aria-pressed={chip.side === side}
            onClick={() => onSide(chip.side)}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-input px-3.5 py-1.5 text-sm font-medium text-muted-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
          >
            {chip.label}
            <span className="tabular-nums opacity-70">{chip.count}</span>
          </button>
        ))}
      </div>

      {children}

      <div ref={listTop} className="scroll-mt-20">
        {view.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {members.length === 0 && !query && !filtered ? t("empty") : t("noResults")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.items.map((member) => (
              <MemberCard key={member.id} member={member} safety={safety} />
            ))}
          </ul>
        )}
      </div>

      {view.total > 0 && (
        <PagerButtons
          page={view.page}
          pageCount={view.pageCount}
          rangeLabel={t("range", { from: view.from, to: view.to, total: view.total })}
          onPage={onPage}
        />
      )}
    </>
  );
}
