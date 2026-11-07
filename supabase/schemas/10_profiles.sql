-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in user (created automatically on sign-up).
-- A new profile starts as `pending`; an admin activates it (later: automatically
-- when it matches an approved application).
-- ---------------------------------------------------------------------------

create type public.member_role as enum ('member', 'organizer', 'admin');
create type public.member_status as enum ('pending', 'active', 'inactive');
create type public.istanbul_side as enum ('asian', 'european');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  preferred_locale text not null default 'tr' check (preferred_locale in ('tr', 'en')),
  role public.member_role not null default 'member',
  status public.member_status not null default 'pending',
  city text not null default 'İstanbul' check (char_length(city) between 1 and 80),
  district text check (char_length(district) <= 80),
  -- Only meaningful for Istanbul; derived from the district by the app.
  side public.istanbul_side,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Club member profiles, one per auth user.';
comment on column public.profiles.status is 'pending = signed in but not yet approved; active = club member; inactive = left or suspended.';

create index profiles_status_idx on public.profiles (status);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so they can read profiles without
-- recursing into the profiles RLS policies).
-- ---------------------------------------------------------------------------

create or replace function private.my_role()
returns public.member_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active';
$$;

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.my_role() is not null;
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() in ('organizer', 'admin'), false);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'admin', false);
$$;

revoke all on function private.my_role() from public, anon;
revoke all on function private.is_active_member() from public, anon;
revoke all on function private.is_staff() from public, anon;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.my_role() to authenticated;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_staff() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: explicit opt-in. Members may edit only their own personal
-- fields; role and status are changed exclusively via admin_set_member_access().
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, avatar_url, preferred_locale, city, district, side)
  on table public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "profiles: read own, active members, or all as staff"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.is_staff())
  or (status = 'active' and (select private.is_active_member()))
);

create policy "profiles: update own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Admin RPC: change a member's role/status.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_member_access(
  target_id uuid,
  new_role public.member_role,
  new_status public.member_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only admins can change member access'
      using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) and (new_role <> 'admin' or new_status <> 'active') then
    raise exception 'admins cannot demote or deactivate themselves'
      using errcode = '42501';
  end if;

  update public.profiles
  set role = new_role, status = new_status
  where id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_member_access(uuid, public.member_role, public.member_status) from public, anon;
grant execute on function public.admin_set_member_access(uuid, public.member_role, public.member_status) to authenticated;

-- ---------------------------------------------------------------------------
-- Create a profile when a user signs up (Google provides name + picture).
-- ---------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
