-- Read-only preview of the name tidying in migration *_members_backfill.sql (steps 3 and 4).
-- KEEP IN SYNC: the two pg_temp functions below are exact copies of private.uses_turkish_casing and
-- private.tidy_name in supabase/schemas/02_names.sql, and the profile casing rule matches backfill step 4.
-- Self-contained: runs BEFORE the migrations are pushed (rollout step 1), when the private.* functions
-- don't exist on production yet. The temp functions live only in this transaction, which is rolled back.
-- Run by iltan only, against production, e.g.:
--   docker run --rm -i postgres:17-alpine psql "$URL" < scripts/sql/name-tidy-preview.sql
-- The output contains personal data: do not paste it anywhere (chat, repo, logs).
begin;

create function pg_temp.uses_turkish_casing(name text, locale text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select locale = 'tr' or name ~ '[ğĞıİşŞ]';
$$;

create function pg_temp.tidy_name(name text, turkish boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  words text[];
  parts text[];
  word text;
  part text;
  low text;
  upp text;
  letters int;
  result_words text[] := '{}';
  result_parts text[];
  w int := 0;
begin
  words := string_to_array(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g'), ' ');
  foreach word in array words loop
    w := w + 1;
    -- Particles (de, van, von, …) stay lowercase unless they open the name.
    if w > 1 and word in ('de', 'da', 'di', 'du', 'van', 'von', 'der', 'den', 'la', 'le') then
      result_words := result_words || word;
      continue;
    end if;
    parts := string_to_array(word, '-');
    result_parts := '{}';
    foreach part in array parts loop
      if turkish then
        low := lower(translate(part, 'İI', 'iı'));
        upp := upper(translate(part, 'iı', 'İI'));
      else
        low := lower(translate(part, 'İ', 'I'));
        upp := upper(translate(part, 'İ', 'I'));
      end if;
      letters := char_length(regexp_replace(part, '[^[:alpha:]]', '', 'g'));
      if part = low and letters >= 1 then
        -- all lowercase: capitalise the first letter
        if turkish then
          part := upper(translate(left(part, 1), 'iı', 'İI')) || substr(part, 2);
        else
          part := upper(left(part, 1)) || substr(part, 2);
        end if;
      elsif part = upp and letters >= 2 then
        -- ALL CAPS: keep the first letter, lower the rest
        if turkish then
          part := left(part, 1) || lower(translate(substr(part, 2), 'İI', 'iı'));
        else
          part := left(part, 1) || lower(translate(substr(part, 2), 'İ', 'I'));
        end if;
      end if;
      result_parts := result_parts || part;
    end loop;
    result_words := result_words || array_to_string(result_parts, '-');
  end loop;
  return array_to_string(result_words, ' ');
end;
$$;

set transaction read only;

with newest as (
  -- newest linked approved application per profile: its locale decides the profile's casing
  select distinct on (profile_id) profile_id, locale
  from public.applications
  where status = 'approved' and profile_id is not null
  order by profile_id, reviewed_at desc nulls last, created_at desc, id desc
)
select t as "table", id, before, after
from (
  select 'applications' as t, id, full_name as before,
         pg_temp.tidy_name(full_name, pg_temp.uses_turkish_casing(full_name, locale)) as after
  from public.applications
  union all
  select 'profiles', p.id, p.full_name,
         pg_temp.tidy_name(p.full_name,
           pg_temp.uses_turkish_casing(p.full_name, coalesce(newest.locale, p.preferred_locale)))
  from public.profiles p
  left join newest on newest.profile_id = p.id
) x
where before is distinct from after
order by t, before;

rollback;
