-- ---------------------------------------------------------------------------
-- Operations helpers.
-- ---------------------------------------------------------------------------

-- Called by the Vercel cron (/api/keep-alive) a few times a day so the Free
-- plan project never looks inactive ("a few user requests to the database each
-- day" — Supabase docs, Project Pausing). Reads no data, so it's safe to expose.
create or replace function public.keep_alive()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.keep_alive() from public, anon, authenticated;
grant execute on function public.keep_alive() to anon;
