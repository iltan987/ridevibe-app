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
