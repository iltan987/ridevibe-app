# Deleting an account by hand: runbook

Members delete their own account on `/account` (14-day grace, then the purge job: CLAUDE.md "Account status and
deletion"). This manual path is for **staff-requested deletions only**, and only on iltan's explicit OK. Prefer
asking the person to use the self-service flow.

Steps 3 and 5 are SQL writes on production. The Claude Code hook blocks remote SQL writes, so Claude prepares the
statements (scoped by the person's id) and iltan runs them in their own terminal, as with any other production write
(`docs/runbooks/database-backup.md`, "What runs").

1. `pnpm db:backup` first (`docs/runbooks/database-backup.md`).
2. Read-only checks (CLAUDE.md "Investigating production data"): the person's status, role, linked application and
   any `applications.reviewed_by` pointing at them.
3. Delete the person's non-rejected applications first. Exception: an **inactive** person's approved application is
   kept, with `retained_until` = now + 1 year (like the purge does). Why: a remaining approved, unlinked application
   would re-activate them on their next sign-in.
4. `DELETE {SUPABASE_URL}/auth/v1/admin/users/<id>` with `SUPABASE_SECRET_KEY`. This cascades `profiles`,
   `member_contacts`, `member_details`, `member_motorcycles`, `member_emergency_contacts` and `member_health`;
   applications become unlinked and `reviewed_by` becomes null; `safety_access_log` rows stay with actor/target null.
5. Delete the person's `auth.audit_log_entries` rows too (no FK; match `payload->>'actor_id'`; the rows also hold the
   email in `actor_username` and the IP in `ip_address`).

Afterwards: their access token stays valid for up to 1 h, but the app shows them signed out because the profile row
is gone (`getCurrentUser()`; see CLAUDE.md "Stack & conventions").
