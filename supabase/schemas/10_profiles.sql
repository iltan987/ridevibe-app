-- ---------------------------------------------------------------------------
-- Profiles: one row per signed-in user (created automatically on sign-up).
-- A new profile starts as `pending`; staff with `members.manage` activate it
-- (later: automatically when it matches an approved application).
-- ---------------------------------------------------------------------------

create type public.member_status as enum ('pending', 'probation', 'active', 'inactive', 'deleting');
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
  deletion_requested_at timestamptz,
  status_before_deletion public.member_status,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_deletion_state check (
    (status = 'deleting') = (deletion_requested_at is not null)
    and (status = 'deleting') = (status_before_deletion is not null)
    and status_before_deletion is distinct from 'deleting'
  )
);

comment on table public.profiles is 'Club member profiles, one per auth user.';
comment on column public.profiles.status is 'pending = signed in but not yet approved; probation = ön alım, approved but not yet a full member (no member rights); active = club member; inactive = left or suspended; deleting = asked to delete the account (hidden, no rights, purged after 14 days).';
comment on column public.profiles.deletion_requested_at is 'When the member asked to delete the account; set only while status = deleting.';
comment on column public.profiles.status_changed_at is 'When the status last changed; moves into or out of deleting keep it. Null = before 2026-11-18.';
comment on column public.profiles.status_before_deletion is 'The status to restore if the member cancels the deletion; set only while status = deleting.';

create or replace function private.profiles_stamp_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status and old.status <> 'deleting' and new.status <> 'deleting' then
    new.status_changed_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.profiles_stamp_status_change() from public, anon, authenticated;

create trigger profiles_stamp_status_change
  before update of status on public.profiles
  for each row execute function private.profiles_stamp_status_change();

-- Member/access lists: filter by status, newest first, keyset-paginated by (created_at, id).
create index profiles_status_created_idx on public.profiles (status, created_at desc, id desc);
create index profiles_role_id_idx on public.profiles (role_id);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

-- security definer: the trigger fires with the writer's rights (anon for the public
-- form), who may not call private.* helpers.
create or replace function private.profiles_tidy_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name = private.tidy_name(
    new.full_name, private.uses_turkish_casing(new.full_name, new.preferred_locale));
  return new;
end;
$$;

revoke all on function private.profiles_tidy_name() from public, anon, authenticated;

-- Insert only (form submissions, sign-ups): staff corrections (set_member_name, the
-- application contact editor) are stored as typed, so an ALL-CAPS word like "XYZ" sticks.
create trigger profiles_tidy_name
before insert on public.profiles
for each row execute function private.profiles_tidy_name();

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
-- No full_name (name lock: staff correct names via set_member_name) and no avatar_url
-- (the directory shows avatars to every member; a self-set URL could log viewers' IPs).
grant update (preferred_locale, city, district, side)
  on table public.profiles to authenticated;

alter table public.profiles enable row level security;

create policy "profiles: read own, active members, or all with members.manage"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or ((select private.has_permission('members.manage')) and status <> 'deleting')
  or (status = 'active' and (select private.is_active_member()))
);

create policy "profiles: update own"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Member contacts: the sign-in email, kept apart from profiles because every
-- active member can read profiles. Readable by the person and by staff with
-- members.manage (to recognise pending sign-ups). Maintained by triggers on
-- auth.users only — nobody writes it over the API.
-- ---------------------------------------------------------------------------

create table public.member_contacts (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  email text check (char_length(email) <= 320),
  updated_at timestamptz not null default now()
);

comment on table public.member_contacts is 'Private contact data per member (sign-in email). Synced from auth.users.';

-- Safe here (unlike on applications): only security-definer triggers write this table.
create index member_contacts_normalized_email_idx on public.member_contacts (private.normalize_email(email));

revoke all on table public.member_contacts from anon, authenticated;
grant select on table public.member_contacts to authenticated;

alter table public.member_contacts enable row level security;

create policy "member_contacts: read own or with members.manage"
on public.member_contacts
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (
    (select private.has_permission('members.manage'))
    and exists (select 1 from public.profiles p where p.id = profile_id and p.status <> 'deleting')
  )
);

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

  -- An account being deleted is hidden from staff: answer exactly as for an unknown id.
  if exists (select 1 from public.profiles p where p.id = target_id and p.status = 'deleting') then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
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
  target_status public.member_status;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if target_id = (select auth.uid()) then
    raise exception 'you cannot change your own status' using errcode = '42501';
  end if;

  -- Deleting is the member's own decision (request_my_account_deletion), never staff's.
  if new_status = 'deleting' then
    raise exception 'staff cannot set the deleting status' using errcode = '42501';
  end if;

  select coalesce(r.is_admin, false), p.status into target_is_admin, target_status
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  -- A deleting target is hidden from staff: same answer as an unknown id.
  if not found or target_status = 'deleting' then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can change an admin''s status' using errcode = '42501';
  end if;

  -- A pending account first goes through ön alım.
  if target_status = 'pending' and new_status = 'active' then
    raise exception 'a pending account must go through probation first' using errcode = '42501';
  end if;

  update public.profiles set status = new_status where id = target_id;
end;
$$;

-- members.manage: correct a member's name (e.g. the Google account name isn't
-- the real one). Trimmed, 2–120 characters. Only admins may rename an admin.
-- Members cannot edit their own name (no profiles update grant on full_name).
create or replace function public.set_member_name(target_id uuid, new_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_name text := btrim(new_name);
  target_is_admin boolean;
  target_status public.member_status;
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  if clean_name is null or char_length(clean_name) not between 2 and 120 then
    raise exception 'a name must be 2 to 120 characters' using errcode = '23514';
  end if;

  select coalesce(r.is_admin, false), p.status into target_is_admin, target_status
  from public.profiles p
  left join public.roles r on r.id = p.role_id
  where p.id = target_id;

  -- A deleting target is hidden from staff: same answer as an unknown id.
  if not found or target_status = 'deleting' then
    raise exception 'profile % not found', target_id using errcode = 'P0002';
  end if;

  if target_is_admin and not private.is_admin() then
    raise exception 'only admins can rename an admin' using errcode = '42501';
  end if;

  update public.profiles set full_name = clean_name where id = target_id;
end;
$$;

-- Self-service account deletion (any status): the member starts a 14-day grace period, during which the account
-- is `deleting` (no rights, signed in only to cancel). The purge job (a later migration) removes it afterwards.
-- The last active admin cannot request it (the club would lose all role management).
create or replace function public.request_my_account_deletion()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  current_status public.member_status;
  is_active_admin boolean;
  requested timestamptz;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Unlocked peek: is the caller an active admin? Admins take the ordered lock on every active admin
  -- (own row included) before anything else, so two admins requesting at once cannot deadlock
  -- (40P01). A role change between this peek and the lock is harmless: a stale answer at worst
  -- locks too much, or skips the last-admin check for a caller who became an admin a moment ago.
  select coalesce(r.is_admin, false) and p.status = 'active' into is_active_admin
  from public.profiles p left join public.roles r on r.id = p.role_id
  where p.id = me;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;

  if is_active_admin then
    perform 1 from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_admin and p.status = 'active'
    order by p.id
    for update of p;
  end if;

  select p.status into current_status from public.profiles p where p.id = me for update;
  if current_status = 'deleting' then
    raise exception 'account deletion is already requested' using errcode = '55000';
  end if;

  if is_active_admin and current_status = 'active' and not exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where r.is_admin and p.status = 'active' and p.id <> me
  ) then
    raise exception 'you are the only active admin' using errcode = '42501', hint = 'last_admin';
  end if;

  update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = current_status
  where id = me
  returning deletion_requested_at into requested;

  return requested + interval '14 days';
end;
$$;

create or replace function public.cancel_my_account_deletion()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  previous public.member_status;
begin
  if me is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  select p.status_before_deletion into previous
  from public.profiles p where p.id = me and p.status = 'deleting' for update;
  if not found then
    raise exception 'no account deletion to cancel' using errcode = '55000';
  end if;

  update public.profiles
  set status = previous, deletion_requested_at = null, status_before_deletion = null
  where id = me;
end;
$$;

revoke all on function public.request_my_account_deletion() from public, anon;
revoke all on function public.cancel_my_account_deletion() from public, anon;
grant execute on function public.request_my_account_deletion() to authenticated;
grant execute on function public.cancel_my_account_deletion() to authenticated;

revoke all on function public.set_member_role(uuid, uuid) from public, anon;
revoke all on function public.set_member_status(uuid, public.member_status) from public, anon;
revoke all on function public.set_member_name(uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid) to authenticated;
grant execute on function public.set_member_status(uuid, public.member_status) to authenticated;
grant execute on function public.set_member_name(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Create a profile when a user signs up (Google provides name + picture), keep
-- the sign-in email in member_contacts, and activate the member right away if
-- an approved application with the same email exists (20_applications.sql).
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
  insert into public.member_contacts (profile_id, email) values (new.id, new.email);
  insert into public.member_details (profile_id) values (new.id);
  perform private.activate_from_approved_application(new.id);
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.member_contacts set email = new.email, updated_at = now() where profile_id = new.id;
  return new;
end;
$$;

revoke all on function private.handle_user_email_change() from public, anon, authenticated;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function private.handle_user_email_change();

-- Supabase Auth rewrites the Google identity's identity_data with Google's current data on every sign-in, so a
-- changed Google photo reaches the profile at the next sign-in. Source is auth.identities, never
-- raw_user_meta_data: users can rewrite their own user metadata through the Auth API (updateUser), which would let
-- anyone show any URL (e.g. a tracking pixel) as their photo in the directory. Only the photo: names are never
-- refreshed (staff corrections stay). A missing or over-long URL keeps the old photo (a failing CHECK would abort
-- the sign-in).
create or replace function private.handle_google_avatar_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text := new.identity_data ->> 'avatar_url';
begin
  if url is not null and char_length(url) <= 2048 then
    update public.profiles set avatar_url = url where id = new.user_id and avatar_url is distinct from url;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_google_avatar_change() from public, anon, authenticated;

create trigger on_google_identity_avatar_changed
after update of identity_data on auth.identities
for each row when (
  new.provider = 'google'
  and old.identity_data ->> 'avatar_url' is distinct from new.identity_data ->> 'avatar_url'
)
execute function private.handle_google_avatar_change();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();
