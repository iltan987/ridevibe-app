-- ---------------------------------------------------------------------------
-- Roles & permissions. Admins create roles (e.g. "Ride captain", "Membership
-- team") and pick each role's permissions; every member has at most one role
-- (profiles.role_id; null = regular member without staff rights).
--
-- The built-in admin role (is_admin) implicitly has every permission plus the
-- admin-only powers that are deliberately NOT permissions, so they can never
-- be handed out by accident: editing roles and assigning roles to people.
--
-- Access rules (policies, helpers) live in 10_profiles.sql, next to the
-- profiles table they depend on.
-- ---------------------------------------------------------------------------

-- Add a value here only together with the code that enforces it.
create type public.permission as enum (
  'applications.view',    -- read applications
  'applications.review',  -- mark new/contacted, edit notes
  'applications.decide',  -- approve/reject (approval grants membership)
  'applications.delete',  -- erase an application (KVKK request)
  'members.manage'        -- see pending sign-ups, activate/deactivate members
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.roles is 'Staff roles. The single is_admin row is built in (created by migration).';

create unique index roles_name_key on public.roles (lower(trim(name)));
-- Exactly one built-in admin role.
create unique index roles_single_admin_key on public.roles (is_admin) where is_admin;

create trigger roles_set_updated_at
before update on public.roles
for each row execute function private.set_updated_at();

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission public.permission not null,
  primary key (role_id, permission)
);

comment on table public.role_permissions is 'Permissions of non-admin roles (the admin role has all implicitly).';
