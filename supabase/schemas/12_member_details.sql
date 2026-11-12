-- ---------------------------------------------------------------------------
-- Member details: private per-member data that the directory exposes only
-- through an RPC (never by direct select): birth date (from the application),
-- Instagram, visibility switches and the photo-gallery consent (KVKK açık rıza).
-- Rows are created by handle_new_user (10_profiles.sql); deleted by cascade.
-- ---------------------------------------------------------------------------

create table public.member_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  birth_date date,
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  show_birthday boolean not null default true, -- opt-out since 2026-11-11 (iltan asked the members)
  show_instagram boolean not null default false,
  show_plates boolean not null default true,
  consent_photos boolean not null default false,
  consent_photos_at timestamptz,
  consent_photos_version text check (char_length(consent_photos_version) <= 40),
  updated_at timestamptz not null default now()
);

comment on table public.member_details is 'Private member data: birth date, Instagram, directory visibility switches, photo consent.';
comment on column public.member_details.birth_date is 'Copied from the approved application, or entered once by the member via set_my_birth_date.';
comment on column public.member_details.consent_photos_at is 'Stamped by trigger when consent_photos changes (or copied from an application); null = never decided.';
comment on column public.member_details.consent_photos_version is 'Privacy-notice version the member saw when deciding; written by the app with the consent.';

create trigger member_details_set_updated_at
before update on public.member_details
for each row execute function private.set_updated_at();

-- Members have no grant on consent_photos_at, so their toggles are always stamped. A trusted
-- writer (security-definer helper copying an application's consent) sets its own timestamp,
-- which must not be overwritten. security definer: see profiles_tidy_name.
create or replace function private.member_details_stamp_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.consent_photos is distinct from old.consent_photos
     and new.consent_photos_at is not distinct from old.consent_photos_at then
    new.consent_photos_at = now();
  end if;
  return new;
end;
$$;

revoke all on function private.member_details_stamp_consent() from public, anon, authenticated;

create trigger member_details_stamp_consent
before update on public.member_details
for each row execute function private.member_details_stamp_consent();

revoke all on table public.member_details from anon, authenticated;
grant select on table public.member_details to authenticated;
grant update (instagram, show_birthday, show_instagram, show_plates, consent_photos, consent_photos_version)
  on table public.member_details to authenticated;

alter table public.member_details enable row level security;

create policy "member_details: read own or with members.manage"
on public.member_details
for select
to authenticated
using (
  profile_id = (select auth.uid())
  or (select private.has_permission('members.manage'))
);

-- Members activated without an application have no birth date. They may enter it once
-- (a column grant can't say "only while null"); later changes go through the club team.
-- Same rules as the application form: after 1920-01-01 and 18+ by the Istanbul date.
-- 42501: not an active member, or a birth date is already stored. 23514: invalid date.
create or replace function public.set_my_birth_date(new_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_member() then
    raise exception 'only active members can set a birth date' using errcode = '42501';
  end if;

  perform 1 from public.member_details d
  where d.profile_id = (select auth.uid()) and d.birth_date is null
  for update;
  if not found then
    raise exception 'birth date is already set' using errcode = '42501';
  end if;

  if new_date is null
     or new_date <= date '1920-01-01'
     or new_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'birth date must be after 1920-01-01 and at least 18 years ago'
      using errcode = '23514';
  end if;

  update public.member_details set birth_date = new_date where profile_id = (select auth.uid());
end;
$$;

revoke all on function public.set_my_birth_date(date) from public, anon;
grant execute on function public.set_my_birth_date(date) to authenticated;

-- Any status: withdrawing photo consent must stay possible after membership ends (KVKK).
create policy "member_details: update own"
on public.member_details
for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));
