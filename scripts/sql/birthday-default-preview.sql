-- Read-only preview of the data step in migration *_birthday_shown_by_default.sql
-- (update public.member_details set show_birthday = true where not show_birthday).
-- Counts only, no personal data. Run BEFORE `db push`, e.g.:
--   docker run --rm -i postgres:17-alpine psql "$URL" < scripts/sql/birthday-default-preview.sql
set default_transaction_read_only = on;

-- Rows that flip, by status, and how many of them become visible (a birthday shows only with a birth date).
select p.status,
       count(*) as rows,
       count(*) filter (where not d.show_birthday) as would_flip,
       count(*) filter (where not d.show_birthday and d.birth_date is not null) as becomes_visible
from public.profiles p
join public.member_details d on d.profile_id = p.id
group by p.status
order by p.status;

-- Rough hint at active members who may have turned it off on purpose: still off, but their details row changed
-- since 2026-11-11 (after the members rollout and its backfill). Noisy (Instagram or photo-consent edits also bump
-- updated_at): ask them, don't assume.
select count(*) as off_and_edited_recently
from public.member_details d
join public.profiles p on p.id = d.profile_id
where not d.show_birthday
  and p.status = 'active'
  and d.updated_at > timestamptz '2026-11-11 00:00:00+03';
