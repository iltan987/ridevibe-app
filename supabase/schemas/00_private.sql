-- Private schema: security-definer helpers and trigger functions.
-- It is NOT exposed through the Data API (only `public` is), so nothing here is
-- callable over HTTP. RLS policies may still call these helpers, which is why
-- `authenticated` gets USAGE on the schema and EXECUTE on specific functions.
create schema if not exists private;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Keeps `updated_at` columns current.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Canonical form of an email for matching people across accounts/forms:
-- lowercased and trimmed; for Gmail also without dots and "+tags" in the local
-- part (Google delivers a.b+x@gmail.com to ab@gmail.com). Only for matching —
-- always store and display the original address.
create or replace function private.normalize_email(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when split_part(e, '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(e, '@', 1), '+', 1), '.', '') || '@gmail.com'
    else e
  end
  from (select lower(trim(email)) as e) as t;
$$;

revoke all on function private.normalize_email(text) from public, anon;
grant execute on function private.normalize_email(text) to authenticated;
