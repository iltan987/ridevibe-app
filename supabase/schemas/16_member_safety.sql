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

-- ---------------------------------------------------------------------------
-- Blood type (special-category data, KVKK art. 6): one row per member, created on the
-- first explicit consent. Written only through the two RPCs below; every operation is
-- logged in safety_access_log.
-- ---------------------------------------------------------------------------

create type public.blood_type as enum ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', '0+', '0-');

create type public.safety_action as enum ('view_card', 'filter_blood_type', 'set_blood_type', 'withdraw_blood_type');

create table public.member_health (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  blood_type public.blood_type,
  consent_blood_type boolean not null,
  consent_blood_type_at timestamptz not null,
  consent_blood_type_version text check (char_length(consent_blood_type_version) <= 40),
  updated_at timestamptz not null default now(),
  constraint member_health_consent check (blood_type is null or consent_blood_type)
);

comment on table public.member_health is 'Blood type of a member, only with explicit consent; written via set_my_blood_type / withdraw_my_blood_type_consent.';
comment on column public.member_health.consent_blood_type_at is 'Time of the last give/withdraw of consent.';
comment on column public.member_health.consent_blood_type_version is 'Privacy-notice version the member saw when giving consent.';

create trigger member_health_set_updated_at
before update on public.member_health
for each row execute function private.set_updated_at();

revoke all on table public.member_health from anon, authenticated;
grant select on table public.member_health to authenticated;

alter table public.member_health enable row level security;

create policy "member_health: read own"
on public.member_health
for select
to authenticated
using (profile_id = (select auth.uid()));

-- Access log (KVKK Board decision 2018/10, item 3(c)): written only by security-definer
-- functions, readable by admins.
create table public.safety_access_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  target_id uuid references public.profiles (id) on delete set null,
  action public.safety_action not null,
  detail text check (char_length(detail) <= 20),
  created_at timestamptz not null default now()
);

comment on table public.safety_access_log is 'Who read or wrote blood types or opened someone else''s safety card. detail never holds personal data beyond the filtered blood type.';

revoke all on table public.safety_access_log from anon, authenticated;
grant select on table public.safety_access_log to authenticated;
-- Supabase default privileges hand out the identity sequence too; nobody but the definer functions needs it.
revoke all on sequence public.safety_access_log_id_seq from anon, authenticated;

alter table public.safety_access_log enable row level security;

create policy "safety_access_log: admins read"
on public.safety_access_log
for select
to authenticated
using ((select private.is_admin()));

create or replace function private.log_safety_access(
  action public.safety_action,
  target uuid,
  detail text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.safety_access_log (actor_id, target_id, action, detail)
  values ((select auth.uid()), target, action, detail);
$$;

revoke all on function private.log_safety_access(public.safety_action, uuid, text) from public, anon, authenticated;

create or replace function public.set_my_blood_type(new_type public.blood_type, notice_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if not private.is_active_member() then
    raise exception 'only active members can set a blood type' using errcode = '42501';
  end if;
  if new_type is null then
    raise exception 'blood type is required' using errcode = '23514';
  end if;
  if notice_version is null or btrim(notice_version) = '' or char_length(notice_version) > 40 then
    raise exception 'notice version is required (1-40 characters)' using errcode = '23514';
  end if;

  -- Locks an existing row; on a first call there is nothing to lock, and the `on conflict do update`
  -- below is what keeps concurrent first calls safe.
  perform 1 from public.member_health h where h.profile_id = uid for update;

  insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values (uid, new_type, true, now(), notice_version)
  on conflict (profile_id) do update
    set blood_type = excluded.blood_type,
        consent_blood_type = true,
        -- Keep the stamp of the first consent when the member only changes the type (they did not see the text again).
        consent_blood_type_at = case when public.member_health.consent_blood_type
          then public.member_health.consent_blood_type_at else excluded.consent_blood_type_at end,
        consent_blood_type_version = case when public.member_health.consent_blood_type
          then public.member_health.consent_blood_type_version else excluded.consent_blood_type_version end;

  perform private.log_safety_access('set_blood_type', uid);
end;
$$;

revoke all on function public.set_my_blood_type(public.blood_type, text) from public, anon;
grant execute on function public.set_my_blood_type(public.blood_type, text) to authenticated;

-- Any status: withdrawing consent must stay possible after membership ends (KVKK).
-- No-op (and no log row) when there is nothing to withdraw.
create or replace function public.withdraw_my_blood_type_consent()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  perform 1 from public.member_health h where h.profile_id = uid and h.consent_blood_type for update;
  if not found then
    return;
  end if;

  update public.member_health
  set blood_type = null, consent_blood_type = false, consent_blood_type_at = now()
  where profile_id = uid;

  perform private.log_safety_access('withdraw_blood_type', uid);
end;
$$;

revoke all on function public.withdraw_my_blood_type_consent() from public, anon;
grant execute on function public.withdraw_my_blood_type_consent() to authenticated;

-- Safety card: what staff with members.safety see of an active member in an emergency (contacts,
-- blood type, bikes with plates whatever the directory switch says). Every call is logged.
create or replace function public.member_safety_card(target uuid)
returns table (full_name text, contacts jsonb, blood_type public.blood_type, motorcycles jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('members.safety') then
    raise exception 'members.safety required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target and p.status = 'active') then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  perform private.log_safety_access('view_card', target);

  return query
  select
    p.full_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', c.position, 'name', c.name, 'relationship', c.relationship, 'phone', c.phone
      ) order by c.position)
      from public.member_emergency_contacts c
      where c.profile_id = p.id
    ), '[]'::jsonb),
    (select h.blood_type from public.member_health h where h.profile_id = p.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'brand', m.brand, 'model', m.model, 'cc', m.cc, 'plate', m.plate
      ) order by m.created_at, m.id)
      from public.member_motorcycles m
      where m.profile_id = p.id
    ), '[]'::jsonb)
  from public.profiles p
  where p.id = target;
end;
$$;

revoke all on function public.member_safety_card(uuid) from public, anon;
grant execute on function public.member_safety_card(uuid) to authenticated;
