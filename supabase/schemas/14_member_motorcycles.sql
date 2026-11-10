-- ---------------------------------------------------------------------------
-- Member motorcycles: the bikes a member lists on their profile (max 10).
-- Other members see them only through the member_directory RPC, never by
-- direct select. Deleted by cascade with the profile.
-- ---------------------------------------------------------------------------

create table public.member_motorcycles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  model text not null check (char_length(btrim(model)) between 1 and 60),
  cc smallint check (cc between 50 and 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.member_motorcycles is 'Motorcycles a member lists on their profile (at most 10 per member).';

create index member_motorcycles_profile_idx
  on public.member_motorcycles (profile_id, created_at, id);

create trigger member_motorcycles_set_updated_at
before update on public.member_motorcycles
for each row execute function private.set_updated_at();

-- At most 10 bikes per member: a data limit against abuse. Locks the owner's profile row so
-- concurrent inserts serialize and can't both pass the count. security definer: the trigger
-- runs with the writer's rights, who may not read/lock profiles (see profiles_tidy_name).
create or replace function private.member_motorcycles_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.profiles where id = new.profile_id for update;
  if (select count(*) from public.member_motorcycles where profile_id = new.profile_id) >= 10 then
    raise exception 'member_motorcycles_limit: at most 10 motorcycles per member'
      using errcode = '23514', constraint = 'member_motorcycles_limit';
  end if;
  return new;
end;
$$;

revoke all on function private.member_motorcycles_limit() from public, anon, authenticated;

create trigger member_motorcycles_limit
before insert on public.member_motorcycles
for each row execute function private.member_motorcycles_limit();

revoke all on table public.member_motorcycles from anon, authenticated;
grant select, delete on table public.member_motorcycles to authenticated;
grant insert (profile_id, brand, model, cc) on table public.member_motorcycles to authenticated;
grant update (brand, model, cc) on table public.member_motorcycles to authenticated;

alter table public.member_motorcycles enable row level security;

create policy "member_motorcycles: read own or with members.manage"
on public.member_motorcycles
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.has_permission('members.manage'))
);

create policy "member_motorcycles: insert own while active"
on public.member_motorcycles
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and (select private.is_active_member())
);

create policy "member_motorcycles: update own while active"
on public.member_motorcycles
for update
to authenticated
using (
  profile_id = (select auth.uid())
  and (select private.is_active_member())
)
with check (
  profile_id = (select auth.uid())
  and (select private.is_active_member())
);

create policy "member_motorcycles: delete own while active"
on public.member_motorcycles
for delete
to authenticated
using (
  profile_id = (select auth.uid())
  and (select private.is_active_member())
);
