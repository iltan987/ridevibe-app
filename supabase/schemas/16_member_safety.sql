-- ---------------------------------------------------------------------------
-- Member safety data: emergency contacts (up to two per member). Readable only
-- by the owner; staff with members.safety see them through a dedicated RPC,
-- never by direct select. Deleted by cascade with the profile.
-- ---------------------------------------------------------------------------

create type public.emergency_relationship as enum (
  'spouse_partner', 'parent', 'sibling', 'child', 'friend', 'other'
);

create table public.member_emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  position smallint not null check (position in (1, 2)),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  relationship public.emergency_relationship not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_emergency_contacts_position_key unique (profile_id, position)
);

comment on table public.member_emergency_contacts is 'Emergency contacts of a member (position 1 and 2).';

create trigger member_emergency_contacts_set_updated_at
before update on public.member_emergency_contacts
for each row execute function private.set_updated_at();

-- Phone rule (private.is_valid_phone). A trigger, not a check constraint: a check runs
-- with the writer's rights, and authenticated has no access to the private schema.
create or replace function private.member_emergency_contacts_check_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_valid_phone(new.phone) then
    raise exception 'member_emergency_contacts_phone: invalid phone number'
      using errcode = '23514', constraint = 'member_emergency_contacts_phone';
  end if;
  return new;
end;
$$;

revoke all on function private.member_emergency_contacts_check_phone() from public, anon, authenticated;

create trigger member_emergency_contacts_phone
before insert or update of phone on public.member_emergency_contacts
for each row execute function private.member_emergency_contacts_check_phone();

revoke all on table public.member_emergency_contacts from anon, authenticated;
grant select, delete on table public.member_emergency_contacts to authenticated;
grant insert (profile_id, position, name, relationship, phone) on table public.member_emergency_contacts to authenticated;
grant update (name, relationship, phone) on table public.member_emergency_contacts to authenticated;

alter table public.member_emergency_contacts enable row level security;

create policy "member_emergency_contacts: read own"
on public.member_emergency_contacts
for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "member_emergency_contacts: insert own while active"
on public.member_emergency_contacts
for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and (select private.is_active_member())
);

create policy "member_emergency_contacts: update own while active"
on public.member_emergency_contacts
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

-- Delete in any status: leaving members can still erase their data (KVKK).
create policy "member_emergency_contacts: delete own"
on public.member_emergency_contacts
for delete
to authenticated
using (profile_id = (select auth.uid()));
