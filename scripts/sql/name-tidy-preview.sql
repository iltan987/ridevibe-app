-- Read-only preview of the name tidying in migration *_members_backfill.sql.
-- Run by iltan only, against production, e.g.:
--   docker run --rm -i postgres:17-alpine psql "$URL" < scripts/sql/name-tidy-preview.sql
-- The output contains personal data: do not paste it anywhere (chat, repo, logs).
set default_transaction_read_only = on;

select t as "table", id, before, after
from (
  select 'applications' as t, id, full_name as before,
         private.tidy_name(full_name, private.uses_turkish_casing(full_name, locale)) as after
  from public.applications
  union all
  select 'profiles', id, full_name,
         private.tidy_name(full_name, private.uses_turkish_casing(full_name, preferred_locale))
  from public.profiles
) x
where before is distinct from after
order by t, before;
