-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in user (created automatically on sign-up).
-- A new profile starts as `pending`; staff with `members.manage` activate it
-- (later: automatically when it matches an approved application).
-- ---------------------------------------------------------------------------

create type public.member_status as enum ('pending', 'active', 'inactive');
create type public.istanbul_side as enum ('asian', 'european');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_url text check (char_length(avatar_url) <= 2048),
  preferred_locale text not null default 'tr' check (preferred_locale in ('tr', 'en')),
  -- null = regular member without staff rights (see 05_roles.sql).
  role_id uuid references public.roles (id) on delete set null,
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

-- Member/access lists: filter by status, newest first, keyset-paginated by (created_at, id).
create index profiles_status_created_idx on public.profiles (status, created_at desc, id desc);
create index profiles_role_id_idx on public.profiles (role_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so they can read profiles/roles without
-- recursing into their RLS policies). Only *active* members have any rights.
-- ---------------------------------------------------------------------------

create or replace function private.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status = 'active'
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = (select auth.uid()) and p.status = 'active' and r.is_admin
  );
$$;

-- In policies, wrap as `(select private.has_permission('…'))` so it runs once per query.
create or replace function private.has_permission(required public.permission)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = (select auth.uid())
      and p.status = 'active'
      and (
        r.is_admin
        or exists (
          select 1 from public.role_permissions rp
          where rp.role_id = r.id and rp.permission = required
        )
      )
  );
$$;

revoke all on function private.is_active_member() from public, anon;
revoke all on function private.is_admin() from public, anon;
revoke all on function private.has_permission(public.permission) from public, anon;
grant execute on function private.is_active_member() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.has_permission(public.permission) to authenticated;

-- ---------------------------------------------------------------------------
-- Profiles privileges: explicit opt-in. Members may edit only their own
-- personal fields; role and status change only via set_member_role() /
-- set_member_status() below.
-- ---------------------------------------------------------------------------

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name, avatar_url, preferred_locale, city, district, side)
  on table public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "profiles: read own, active members, or all with members.manage"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.has_permission('members.manage'))
  or (status = 'active' and (select private.is_active_member()))
);

create policy "profiles: update own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Roles privileges (tables in 05_roles.sql). Anyone signed in may read role
-- names/permissions (not personal data; the app shows them). Only admins edit
-- them, and nobody can edit or delete the built-in admin role or create
-- another one (`is_admin` is not grantable).
-- ---------------------------------------------------------------------------

revoke all on table public.roles from anon, authenticated;
grant select on table public.roles to authenticated;
grant insert (name), update (name), delete on table public.roles to authenticated;

alter table public.roles enable row level security;

create policy "roles: signed-in users can read"
on public.roles
for select
to authenticated
using (true);

create policy "roles: admins can create"
on public.roles
for insert
to authenticated
with check ((select private.is_admin()) and not is_admin);

create policy "roles: admins can rename custom roles"
on public.roles
for update
to authenticated
using ((select private.is_admin()) and not is_admin)
with check ((select private.is_admin()) and not is_admin);

create policy "roles: admins can delete custom roles"
on public.roles
for delete
to authenticated
using ((select private.is_admin()) and not is_admin);

revoke all on table public.role_permissions from anon, authenticated;
grant select, insert, delete on table public.role_permissions to authenticated;

alter table public.role_permissions enable row level security;

create policy "role_permissions: signed-in users can read"
on public.role_permissions
for select
to authenticated
using (true);

create policy "role_permissions: admins can grant on custom roles"
on public.role_permissions
for insert
to authenticated
with check (
  (select private.is_admin())
  and exists (select 1 from public.roles r where r.id = role_id and not r.is_admin)
);

create policy "role_permissions: admins can revoke on custom roles"
on public.role_permissions
for delete
to authenticated
using (
  (select private.is_admin())
  and exists (select 1 from public.roles r where r.id = role_id and not r.is_admin)
);

-- ---------------------------------------------------------------------------
-- Access RPCs. Nobody changes their own role or status (no self-promotion,
-- no locking yourself out).
-- ---------------------------------------------------------------------------

-- Admins only: give a member a role, or none (null = regular member).
create or replace function public.set_member_role(target_id uuid, new_role_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only admins can assign roles' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own role' using errcode = '42501';
  end if;

  update public.profiles set role_id = new_role_id where id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;
end;
$$;

-- members.manage: activate/deactivate members. Only admins may change an
-- admin's status.
create or replace function public.set_member_status(target_id uuid, new_status public.member_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_is_admin boolean;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;

  select coalesce(r.is_admin, false) into target_is_admin
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  if not found then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can change an admin''s status' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid) from public, anon;
revoke all on function public.set_member_status(uuid, public.member_status) from public, anon;
grant execute on function public.set_member_role(uuid, uuid) to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;

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
    -- Drop (don't truncate) an over-long picture URL: a failing CHECK here
    -- would abort the whole sign-up.
    case when char_length(new.raw_user_meta_data ->> 'avatar_url') <= 2048
      then new.raw_user_meta_data ->> 'avatar_url' end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
