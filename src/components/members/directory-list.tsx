"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useRef } from "react";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { ListChip } from "@/components/lists/list-chip";
import { useListParams } from "@/components/lists/use-list-params";
import { scrollToListTop, useListSearch, useUrlFix } from "@/components/lists/use-list-search";
import { MemberCard } from "@/components/members/member-card";
import { PagerButtons } from "@/components/pager-buttons";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { listSearch, paramOff } from "@/lib/list-url";
import { directoryView } from "@/lib/members/directory-view";
import type { DirectoryMember, IstanbulSide } from "@/lib/members/queries";
import { foldSearch, SEARCH_MAX_LENGTH } from "@/lib/search-fold";

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
  const search = useListSearch(params);
  const side = SIDES.find((s) => s === params.get("side")) ?? null;
  // Safety filters only exist for members.safety holders: never carry them for anyone else.
  const blood = safety ? params.get("blood") : null;
  const noContact = safety ? params.get("noContact") : null;

  const folded = members.map((member) => foldSearch(member.fullName));
  const view = directoryView(members, folded, { query: search.query, side, page: search.page });

  const urlValues = (changes: Record<string, string | number | null>) => ({
    q: search.query,
    side,
    page: view.page,
    blood,
    noContact,
    ...changes,
  });

  // A malformed or out-of-range ?page= renders the clamped page, an unknown ?side= all sides; correct the URL to match.
  const urlOff = search.pageOff(view.page) || paramOff(params.get("side"), side);
  useUrlFix(urlOff ? listSearch(urlValues({}), DEFAULTS) : null);

  const listTop = useRef<HTMLDivElement>(null);

  function onSearch(value: string) {
    const next = search.type(value);
    if (next !== null) params.replace(urlValues({ q: next, page: null }), DEFAULTS);
  }

  function onSide(next: IstanbulSide | null) {
    if (next !== side) params.push(urlValues({ side: next, page: null }), DEFAULTS);
  }

  function onPage(next: number) {
    if (next === view.page) return;
    params.push(urlValues({ page: next }), DEFAULTS);
    scrollToListTop(listTop.current);
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

      {overCeiling && <CeilingNotice>{t("ceiling")}</CeilingNotice>}

      {/* Filters as you type; the GET fields only matter without JavaScript. */}
      <form role="search" data-skeleton-result="members-search" className="flex" onSubmit={(e) => e.preventDefault()}>
        {side && <input type="hidden" name="side" value={side} />}
        {blood && <input type="hidden" name="blood" value={blood} />}
        {noContact && <input type="hidden" name="noContact" value={noContact} />}
        <Input
          name="q"
          type="search"
          value={search.input}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("search")}
          aria-label={t("searchLabel")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      </form>

      <div data-skeleton-result="members-chips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((chip) => (
          <ListChip
            key={chip.side ?? "all"}
            pressed={chip.side === side}
            count={chip.count}
            onClick={() => onSide(chip.side)}
          >
            {chip.label}
          </ListChip>
        ))}
      </div>

      {children}

      <div ref={listTop} className="scroll-mt-20">
        {view.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">
            {members.length === 0 && !search.query && !filtered ? t("empty") : t("noResults")}
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
