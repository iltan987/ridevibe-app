"use client";

import { useTranslations } from "next-intl";
import { useRef } from "react";
import { MemberRow, type MemberRowData } from "@/components/admin/member-row";
import { CeilingNotice } from "@/components/lists/ceiling-notice";
import { ListChip } from "@/components/lists/list-chip";
import { useListParams } from "@/components/lists/use-list-params";
import { scrollToListTop, useListSearch, useUrlFix } from "@/components/lists/use-list-search";
import { PagerButtons } from "@/components/pager-buttons";
import { Input } from "@/components/ui/input";
import { MEMBER_STATUSES, type MemberStatus, membersView } from "@/lib/access/members-view";
import { listSearch, paramOff } from "@/lib/list-url";
import { SEARCH_MAX_LENGTH } from "@/lib/search-fold";

const DEFAULTS = { status: "pending", page: 1 };

type MembersListRow = MemberRowData & { canChangeStatus: boolean; canRename: boolean; search: string };

/**
 * The admin members list in the browser: status tabs, search (name or email) and pages over every profile from the
 * server, with the state in the URL (`?status=…&q=…&page=…`, defaults left out). Typing replaces the history entry,
 * tabs and pages push one; nothing goes to the server. A row action's `refresh()` brings new `rows` and keeps the
 * URL state; a page it empties is clamped. `search` = `foldSearch(name + " " + email)`, folded on the server.
 */
export function MembersList({
  rows,
  roles,
  meId,
  canAssignRole,
  overCeiling,
}: {
  rows: MembersListRow[];
  roles: { id: string; label: string }[];
  meId: string;
  canAssignRole: boolean;
  overCeiling: boolean;
}) {
  const t = useTranslations("Admin.members");
  const params = useListParams();
  const search = useListSearch(params);
  const status: MemberStatus = MEMBER_STATUSES.find((s) => s === params.get("status")) ?? "pending";

  const view = membersView(rows, { query: search.query, status, page: search.page });

  const urlValues = (changes: Record<string, string | number | null>) => ({
    status,
    q: search.query,
    page: view.page,
    ...changes,
  });

  // A malformed or out-of-range ?page= (also a last page emptied by a row action) renders the clamped page, an
  // unknown ?status= the pending tab; correct the URL to match (also dropping a stale ?cursor= of the old pager).
  const urlOff =
    search.pageOff(view.page) ||
    paramOff(params.raw("status"), status, DEFAULTS.status) ||
    paramOff(params.raw("cursor"), null);
  useUrlFix(urlOff ? listSearch(urlValues({}), DEFAULTS) : null);

  const listTop = useRef<HTMLDivElement>(null);

  function onSearch(value: string) {
    const next = search.type(value);
    if (next !== null) params.replace(urlValues({ q: next, page: null }), DEFAULTS);
  }

  function onStatus(next: MemberStatus) {
    if (next !== status) params.push(urlValues({ status: next, page: null }), DEFAULTS);
  }

  function onPage(next: number) {
    if (next === view.page) return;
    params.push(urlValues({ page: next }), DEFAULTS);
    scrollToListTop(listTop.current);
  }

  return (
    <>
      <div data-skeleton-result="admin-chips" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {MEMBER_STATUSES.map((s) => (
          <ListChip key={s} pressed={s === status} count={view.counts[s]} onClick={() => onStatus(s)}>
            {t(`statuses.${s}`)}
          </ListChip>
        ))}
      </div>

      {overCeiling && <CeilingNotice>{t("ceiling")}</CeilingNotice>}

      {/* Filters as you type; the GET fields only matter without JavaScript. */}
      <form role="search" data-skeleton-result="admin-search" className="flex" onSubmit={(e) => e.preventDefault()}>
        {status !== "pending" && <input type="hidden" name="status" value={status} />}
        <Input
          name="q"
          type="search"
          value={search.input}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          maxLength={SEARCH_MAX_LENGTH}
        />
      </form>

      {status === "pending" && <p className="text-sm text-muted-foreground">{t("pendingHint")}</p>}

      <div ref={listTop} className="scroll-mt-20">
        {view.items.length === 0 ? (
          <p className="py-10 text-center text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {view.items.map((row) => (
              <MemberRow
                key={row.id}
                member={row}
                roles={roles}
                isSelf={row.id === meId}
                canAssignRole={canAssignRole}
                canChangeStatus={row.canChangeStatus}
                canRename={row.canRename}
              />
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
