-- ---------------------------------------------------------------------------
-- Membership applications (replaces the Google Form). Spec:
-- docs/application-form.md. Anyone may submit; only staff can read/manage.
-- ---------------------------------------------------------------------------

create type public.application_status as enum ('new', 'contacted', 'approved', 'rejected');
-- 'b' = B license holder with the 125 cc (A1) authorisation (since 2024).
create type public.license_class as enum ('a1', 'a2', 'a', 'b', 'none');
create type public.group_ride_experience as enum ('none', 'some', 'a_lot');
create type public.heard_from as enum ('instagram_ad', 'instagram_other', 'friend', 'other');

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  status public.application_status not null default 'new',
  locale text not null default 'tr' check (locale in ('tr', 'en')),

  -- About you
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'), -- E.164, normalized by the app
  email text not null check (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  birth_date date not null check (birth_date > date '1920-01-01'), -- 18+ enforced by trigger
  city text not null default 'İstanbul' check (char_length(city) between 1 and 80),
  district text not null check (char_length(district) between 1 and 80),
  side public.istanbul_side,
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  languages text[] not null
    check (cardinality(languages) >= 1 and languages <@ array['tr', 'en', 'other']),
  other_languages text check (char_length(other_languages) <= 120),

  -- Riding
  license_class public.license_class not null,
  riding_years smallint not null check (riding_years between 0 and 70),
  owns_motorcycle boolean not null,
  motorcycle_brand text check (char_length(motorcycle_brand) <= 60),
  motorcycle_model text check (char_length(motorcycle_model) <= 60),
  motorcycle_cc smallint check (motorcycle_cc between 50 and 3000),
  riding_styles text[] not null
    check (cardinality(riding_styles) >= 1 and riding_styles <@ array[
      'city', 'touring', 'enduro', 'sport', 'cruiser', 'scooter']),
  group_experience public.group_ride_experience not null,

  -- You and the club
  in_other_clubs boolean not null,
  other_club_names text check (char_length(other_club_names) <= 300),
  heard_from public.heard_from not null,
  referrer_name text check (char_length(referrer_name) <= 120),
  event_interests text[] not null
    check (cardinality(event_interests) >= 1 and event_interests <@ array[
      'day_rides', 'multi_day_tours', 'camping', 'coffee_meetups', 'training',
      'off_road', 'track_days', 'maintenance', 'charity_rides', 'other']),
  other_event_interests text check (char_length(other_event_interests) <= 300),
  expectations text not null check (char_length(expectations) between 10 and 1000),
  alienating_behaviors text not null check (char_length(alienating_behaviors) between 3 and 1000),
  -- Added 2026-11-10 (Samet). Nullable: older applications have no answer; the form requires it.
  conflict_handling text check (char_length(conflict_handling) between 3 and 1000),

  -- Consents (KVKK): stored with the notice version the applicant saw.
  consent_privacy boolean not null check (consent_privacy),
  consent_rules boolean not null check (consent_rules),
  consent_photos boolean not null default false,
  privacy_notice_version text not null check (char_length(privacy_notice_version) <= 40),

  -- Ad attribution (from the Instagram ad link)
  utm_source text check (char_length(utm_source) <= 200),
  utm_medium text check (char_length(utm_medium) <= 200),
  utm_campaign text check (char_length(utm_campaign) <= 200),
  utm_content text check (char_length(utm_content) <= 200),
  utm_term text check (char_length(utm_term) <= 200),

  -- Review (staff only)
  admin_notes text check (char_length(admin_notes) <= 4000),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  -- The account this application belongs to (see the column comment below).
  profile_id uuid references public.profiles (id) on delete set null,
  -- Retention deadline set when the owner deletes their account (see the column comment below).
  retained_until timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_motorcycle_details check (
    not owns_motorcycle or (motorcycle_brand is not null and motorcycle_model is not null)
  ),
  constraint applications_other_clubs_named check (
    not in_other_clubs or other_club_names is not null
  ),
  constraint applications_other_languages_named check (
    not ('other' = any (languages)) or other_languages is not null
  ),
  constraint applications_other_events_named check (
    not ('other' = any (event_interests)) or other_event_interests is not null
  )
);

comment on table public.applications is 'Membership applications from the public form.';
comment on column public.applications.profile_id is 'The account this application belongs to: set when submitted while signed in, when staff link it, or when an approved application is matched by email.';
comment on column public.applications.retained_until is 'Set when the owner deletes their account: the application is kept (inactive members: 1 year from the deletion request) and purged after this time. Null = no deadline.';

create index applications_status_created_idx on public.applications (status, created_at desc);

-- One open application per email (a person can re-apply after a decision).
create unique index applications_open_email_key on public.applications (lower(email))
  where status in ('new', 'contacted');

-- One open application per account, too (the applicant may use another email).
create unique index applications_open_profile_key on public.applications (profile_id)
  where status in ('new', 'contacted') and profile_id is not null;

-- No expression index on private.normalize_email(email) here: index
-- expressions run with the *inserting* user's rights, and anon (the public
-- form) has no access to the private schema. Matching scans are rare and small.
create index applications_profile_id_idx on public.applications (profile_id);

create trigger applications_set_updated_at
before update on public.applications
for each row execute function private.set_updated_at();

-- Validate on insert: 18+ (Istanbul date).
create or replace function private.applications_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'applicant must be at least 18 years old'
      using errcode = '23514', constraint = 'applications_min_age';
  end if;
  return new;
end;
$$;

create trigger applications_before_insert
before insert on public.applications
for each row execute function private.applications_before_insert();

-- Contact fields, on submit and on staff corrections: trimmed lowercase email;
-- a Turkish (+90) number must be a mobile (+905 + 9 digits). The phone rule
-- only runs when the phone is set/changed, so old rows stay editable (e.g. an
-- email correction) until someone touches their phone. security definer: the trigger
-- fires with the writer's rights (anon for the public form), who may not call private.*.
create or replace function private.applications_normalize_contact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.email = lower(trim(new.email));
  if (TG_OP = 'INSERT' or new.phone is distinct from old.phone)
    and new.phone like '+90%'
    and not private.is_valid_phone(new.phone)
  then
    raise exception 'a Turkish phone number must be a mobile number (+905…)'
      using errcode = '23514', constraint = 'applications_tr_mobile';
  end if;
  return new;
end;
$$;

create trigger applications_normalize_contact
before insert or update of phone, email on public.applications
for each row execute function private.applications_normalize_contact();

-- security definer: the trigger fires with the writer's rights (anon for the public
-- form), who may not call private.* helpers.
create or replace function private.applications_tidy_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.full_name = private.tidy_name(
    new.full_name, private.uses_turkish_casing(new.full_name, new.locale));
  return new;
end;
$$;

revoke all on function private.applications_tidy_name() from public, anon, authenticated;

-- Insert only (form submissions, sign-ups): staff corrections (set_member_name, the
-- application contact editor) are stored as typed, so an ALL-CAPS word like "XYZ" sticks.
create trigger applications_tidy_name
before insert on public.applications
for each row execute function private.applications_tidy_name();

-- Stamp who reviewed and when, whenever the status changes.
create or replace function private.applications_track_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    new.reviewed_by = (select auth.uid());
    new.reviewed_at = now();
  end if;
  return new;
end;
$$;

create trigger applications_track_review
before update on public.applications
for each row execute function private.applications_track_review();

-- Moving an application into or out of a decision (approved/rejected) needs
-- `applications.decide`; RLS only checks `applications.review` (policies can't
-- compare old and new values). Applies to signed-in users only, so trusted
-- security-definer code (e.g. linking an approved application) isn't blocked.
-- Changing the email of an *approved* application needs decide too: it re-runs
-- activation (applications_after_approval), i.e. it chooses which account the
-- approval activates. Name/phone corrections (any status) and email
-- corrections on new/contacted applications only need review. The email is
-- compared normalised because this trigger runs before
-- applications_normalize_contact (triggers fire in name order).
create or replace function private.applications_check_decision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
    and (
      (new.status is distinct from old.status
        and (new.status in ('approved', 'rejected') or old.status in ('approved', 'rejected')))
      or (old.status = 'approved' and lower(trim(new.email)) is distinct from old.email)
    )
    and not private.has_permission('applications.decide')
  then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger applications_check_decision
before update on public.applications
for each row execute function private.applications_check_decision();

-- ---------------------------------------------------------------------------
-- Approval → membership. A *pending* account with an approved application is
-- activated: the application linked to it (profile_id) first, else one whose
-- email matches the sign-in email (normalize_email) and isn't linked to anyone.
-- The account gets the application's (staff-reviewed) name, and its
-- city/district if it has none; an email match also links the application.
-- Runs when someone signs in after approval (handle_new_user), and when an
-- application is approved or its email corrected after approval (trigger
-- below). Never touches active/inactive accounts, so it can't undo a suspension.
-- ---------------------------------------------------------------------------

create or replace function private.activate_from_approved_application(target_profile uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app record;
begin
  select a.id, a.full_name, a.city, a.district, a.side, a.profile_id into app
  from public.applications a
  where a.status = 'approved'
    and a.profile_id = target_profile
  order by a.reviewed_at desc nulls last, a.created_at desc
  limit 1;
  if not found then
    select a.id, a.full_name, a.city, a.district, a.side, a.profile_id into app
    from public.applications a
    join public.member_contacts c on c.profile_id = target_profile
    where a.status = 'approved'
      and a.profile_id is null
      and private.normalize_email(a.email) = private.normalize_email(c.email)
    order by a.reviewed_at desc nulls last, a.created_at desc
    limit 1;
    if not found then
      return;
    end if;
  end if;

  update public.profiles p
  set status = 'active',
      full_name = app.full_name,
      city = case when p.district is null then app.city else p.city end,
      side = case when p.district is null then app.side else p.side end,
      district = coalesce(p.district, app.district)
  where p.id = target_profile and p.status = 'pending';
  if not found then
    return;
  end if;

  if app.profile_id is null then
    update public.applications set profile_id = target_profile where id = app.id;
  end if;

  perform private.fill_member_from_application(target_profile, app.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Copy what the applicant told us into the member: birth date, Instagram, photo consent and
-- one bike. Only fills gaps, so it is idempotent and never overwrites what the member
-- edited: null birth date / Instagram; consent only if never decided (consent_photos_at is
-- null), stamped with the application's time and notice version; a bike only for an
-- owner with non-blank brand and model and no bikes yet. Creates a missing details row.
-- Called after an activation and when an approved application is attached to an active account.
-- ---------------------------------------------------------------------------

create or replace function private.fill_member_from_application(target_profile uuid, application_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app record;
begin
  select a.birth_date, a.instagram, a.consent_photos, a.created_at, a.privacy_notice_version,
         a.owns_motorcycle, btrim(a.motorcycle_brand) as brand, btrim(a.motorcycle_model) as model,
         a.motorcycle_cc
    into app
  from public.applications a
  where a.id = application_id;
  if not found then
    return;
  end if;

  insert into public.member_details (profile_id) values (target_profile)
  on conflict (profile_id) do nothing;

  update public.member_details d
  set birth_date = coalesce(d.birth_date, app.birth_date),
      instagram = coalesce(d.instagram, app.instagram)
  where d.profile_id = target_profile;

  -- consent_photos_at is set explicitly so the stamp trigger keeps it.
  update public.member_details d
  set consent_photos = app.consent_photos,
      consent_photos_at = app.created_at,
      consent_photos_version = app.privacy_notice_version
  where d.profile_id = target_profile and d.consent_photos_at is null;

  if app.owns_motorcycle
    and coalesce(app.brand, '') <> ''
    and coalesce(app.model, '') <> ''
    and not exists (select 1 from public.member_motorcycles m where m.profile_id = target_profile)
  then
    insert into public.member_motorcycles (profile_id, brand, model, cc)
    values (target_profile, app.brand, app.model, app.motorcycle_cc);
  end if;
end;
$$;

revoke all on function private.fill_member_from_application(uuid, uuid) from public, anon, authenticated;

create or replace function private.applications_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null then
    perform private.activate_from_approved_application(new.profile_id);
  else
    perform private.activate_from_approved_application(c.profile_id)
    from public.member_contacts c
    where private.normalize_email(c.email) = private.normalize_email(new.email);
  end if;
  return null;
end;
$$;

-- Fires on approval and on an email correction of an approved application.
-- `update of status, email` + WHEN keep the profile_id update above from
-- re-firing this trigger.
create trigger applications_after_approval
after update of status, email on public.applications
for each row when (
  new.status = 'approved'
  and (old.status is distinct from new.status or old.email is distinct from new.email)
)
execute function private.applications_after_approval();

revoke all on function private.activate_from_approved_application(uuid) from public, anon, authenticated;
revoke all on function private.applications_after_approval() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Linking an application to an account (applications.decide), for when the
-- applicant signed in with another email than the one on the form. Security
-- definer: deciders may lack members.manage, so RLS would hide pending
-- profiles and their sign-in emails from them. Only these RPCs expose them,
-- and only the unmatched pending ones (plus, for approved applications, active
-- accounts without an application: staff activated them before their
-- application could be matched).
-- ---------------------------------------------------------------------------

-- The application must be unlinked and not rejected; the account must be
-- pending (or active, for an approved application), with no open/approved
-- application linked to it and no *other* open/approved unlinked application
-- with its sign-in email (same rule as linkable_accounts; a rejected one
-- doesn't count). Linking an approved application activates a pending account;
-- one under review activates on approval (applications_after_approval). An
-- active account only gets the application attached (status, name and role
-- stay). Never touches inactive accounts.
create or replace function public.link_application(application_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_status public.application_status;
  target_status public.member_status;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  select a.status into app_status
  from public.applications a
  where a.id = application_id and a.profile_id is null and a.status <> 'rejected'
  for update;
  if not found then
    raise exception 'application % not found or not linkable', application_id using errcode = 'P0002';
  end if;

  select p.status into target_status
  from public.profiles p
  where p.id = target_id
    and (p.status = 'pending' or (p.status = 'active' and app_status = 'approved'))
  for update;
  if not found
    or exists (
      select 1 from public.applications a
      where a.profile_id = target_id and a.status in ('new', 'contacted', 'approved')
    )
    or exists (
      select 1
      from public.applications a
      join public.member_contacts c on c.profile_id = target_id
      where a.id <> application_id
        and a.profile_id is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
  then
    raise exception 'account % not found or not linkable', target_id using errcode = 'P0002';
  end if;

  update public.applications a set profile_id = target_id where a.id = application_id;

  if app_status = 'approved' and target_status = 'pending' then
    perform private.activate_from_approved_application(target_id);
  elsif app_status = 'approved' then
    perform private.fill_member_from_application(target_id, application_id);
  end if;
end;
$$;

-- Pending accounts an application could be linked to (with include_active,
-- for approved applications: active ones too): no open/approved application
-- linked to them and no open/approved unlinked application with their sign-in
-- email (those match automatically). Optional case-insensitive search on name
-- or email. Newest first, keyset by (created_at, id) — both or neither
-- (22023) — PAGE_SIZE + 1 rows.
create or replace function public.linkable_accounts(
  search text default null,
  after_created timestamptz default null,
  after_id uuid default null,
  include_active boolean default false
)
returns table (
  id uuid, full_name text, avatar_url text, email text, created_at timestamptz, status public.member_status
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  pattern text;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  if (after_created is null) <> (after_id is null) then
    raise exception 'after_created and after_id go together' using errcode = '22023';
  end if;

  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, c.email, p.created_at, p.status
  from public.profiles p
  left join public.member_contacts c on c.profile_id = p.id
  where (p.status = 'pending' or (include_active and p.status = 'active'))
    and not exists (
      select 1 from public.applications a
      where a.profile_id = p.id and a.status in ('new', 'contacted', 'approved')
    )
    and not exists (
      select 1 from public.applications a
      where a.profile_id is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
    and (pattern is null or p.full_name ilike pattern or c.email ilike pattern)
    and (after_created is null or (p.created_at, p.id) < (after_created, after_id))
  order by p.created_at desc, p.id desc
  limit 26;
end;
$$;

-- The account an application is linked to (applications.view): id, name,
-- sign-in email and status, so staff can check *which* account an approval
-- activates (anyone signed in can submit someone else's name and phone). Zero
-- rows when the application is unlinked or doesn't exist. Security definer:
-- profiles RLS hides pending/inactive accounts and member_contacts from staff
-- without members.manage.
create or replace function public.application_account(application_id uuid)
returns table (id uuid, full_name text, email text, status public.member_status)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('applications.view') then
    raise exception 'missing permission applications.view' using errcode = '42501';
  end if;

  return query
  select p.id, p.full_name, c.email, p.status
  from public.applications a
  join public.profiles p on p.id = a.profile_id
  left join public.member_contacts c on c.profile_id = p.id
  where a.id = application_account.application_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The applicant's own status (applicants can't read applications): the
-- status of the latest application that is linked to the caller or unlinked
-- with their sign-in email (e.g. a new one after a rejection); null if none.
-- ---------------------------------------------------------------------------
create or replace function public.my_application_status()
returns public.application_status
language sql
stable
security definer
set search_path = ''
as $$
  select a.status
  from public.applications a
  where a.profile_id = (select auth.uid())
    or (
      a.profile_id is null
      and private.normalize_email(a.email) = (
        select private.normalize_email(c.email)
        from public.member_contacts c
        where c.profile_id = (select auth.uid())
      )
    )
  order by a.created_at desc, a.id desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- "Applied?" for a page of the members list (members.manage): whether an
-- open or approved application is linked to the profile, or is unlinked and
-- has its sign-in email. Booleans only — no application data.
-- ---------------------------------------------------------------------------
create or replace function public.pending_application_flags(profile_ids uuid[])
returns table (profile_id uuid, has_application boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('members.manage') then
    raise exception 'missing permission members.manage' using errcode = '42501';
  end if;

  return query
  select ids.pid, exists (
    select 1 from public.applications a
    where a.status in ('new', 'contacted', 'approved')
      and (
        a.profile_id = ids.pid
        or (a.profile_id is null and private.normalize_email(a.email) = private.normalize_email(c.email))
      )
  )
  from unnest(profile_ids) as ids (pid)
  left join public.member_contacts c on c.profile_id = ids.pid;
end;
$$;

revoke all on function public.link_application(uuid, uuid) from public, anon;
revoke all on function public.linkable_accounts(text, timestamptz, uuid, boolean) from public, anon;
revoke all on function public.application_account(uuid) from public, anon;
revoke all on function public.my_application_status() from public, anon;
revoke all on function public.pending_application_flags(uuid[]) from public, anon;
grant execute on function public.link_application(uuid, uuid) to authenticated;
grant execute on function public.linkable_accounts(text, timestamptz, uuid, boolean) to authenticated;
grant execute on function public.application_account(uuid) to authenticated;
grant execute on function public.my_application_status() to authenticated;
grant execute on function public.pending_application_flags(uuid[]) to authenticated;

-- Staff must not see the data of someone who asked to delete their account: true for a non-rejected
-- application linked to a `deleting` profile, or unlinked with the email of a `deleting` profile. Used by the
-- applications select/update policies (runs as the caller, hence security definer).
create or replace function private.application_hidden_for_deletion(
  app_profile_id uuid,
  app_email text,
  app_status public.application_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app_status <> 'rejected' and (
    case
      when app_profile_id is not null then
        exists (select 1 from public.profiles p where p.id = app_profile_id and p.status = 'deleting')
      else
        exists (
          select 1
          from public.profiles p
          join public.member_contacts c on c.profile_id = p.id
          where p.status = 'deleting'
            and private.normalize_email(c.email) = private.normalize_email(app_email)
        )
    end
  );
$$;

revoke all on function private.application_hidden_for_deletion(uuid, text, public.application_status) from public, anon;
grant execute on function private.application_hidden_for_deletion(uuid, text, public.application_status) to authenticated;

revoke all on function private.applications_before_insert() from public, anon, authenticated;
revoke all on function private.applications_normalize_contact() from public, anon, authenticated;
revoke all on function private.applications_track_review() from public, anon, authenticated;
revoke all on function private.applications_check_decision() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: the public may only INSERT the applicant columns (no status,
-- notes or review fields); signed-in applicants may also set profile_id to
-- their own account (policy below). Reading, reviewing (status, notes and
-- contact corrections) and deleting (KVKK erasure) each need a permission
-- (05_roles.sql).
-- ---------------------------------------------------------------------------

revoke all on table public.applications from anon, authenticated;

grant insert (
  locale, full_name, phone, email, birth_date, city, district, side, instagram, languages, other_languages,
  license_class, riding_years, owns_motorcycle, motorcycle_brand, motorcycle_model, motorcycle_cc,
  riding_styles, group_experience, in_other_clubs, other_club_names, heard_from, referrer_name,
  event_interests, other_event_interests, expectations, alienating_behaviors, conflict_handling,
  consent_privacy, consent_rules, consent_photos, privacy_notice_version, utm_source, utm_medium, utm_campaign, utm_content, utm_term
) on table public.applications to anon, authenticated;
grant insert (profile_id) on table public.applications to authenticated;

grant select on table public.applications to authenticated;
grant update (status, admin_notes, full_name, phone, email) on table public.applications to authenticated;
grant delete on table public.applications to authenticated;

alter table public.applications enable row level security;

create policy "applications: anyone can submit a new application"
on public.applications
for insert
to anon
with check (status = 'new');

create policy "applications: signed-in users can submit for their own account"
on public.applications
for insert
to authenticated
with check (status = 'new' and (profile_id is null or profile_id = (select auth.uid())));

create policy "applications: readable with applications.view"
on public.applications
for select
to authenticated
using (
  (select private.has_permission('applications.view'))
  and not private.application_hidden_for_deletion(profile_id, email, status)
);

-- applications.decide implies review; approve/reject itself is checked by the
-- applications_check_decision trigger above.
create policy "applications: reviewable with applications.review or decide"
on public.applications
for update
to authenticated
using (
  (
    (select private.has_permission('applications.review'))
    or (select private.has_permission('applications.decide'))
  )
  and not private.application_hidden_for_deletion(profile_id, email, status)
)
with check (
  (select private.has_permission('applications.review'))
  or (select private.has_permission('applications.decide'))
);

create policy "applications: deletable with applications.delete"
on public.applications
for delete
to authenticated
using ((select private.has_permission('applications.delete')));
