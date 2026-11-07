-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures: an admin, an organizer and an active member (as postgres).
-- Every statement is scoped to fixture rows (@pgtap.invalid) so the test also
-- works on a database with real data (e.g. production; all rolled back).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'pgtap-admin@pgtap.invalid', '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'pgtap-organizer@pgtap.invalid', '{"full_name": "Oya Organizer"}'),
  ('00000000-0000-0000-0000-0000000000c1', 'pgtap-member@pgtap.invalid', '{"full_name": "Mert Member"}');
update public.profiles set role = 'admin', status = 'active' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set role = 'organizer', status = 'active' where id = '00000000-0000-0000-0000-0000000000b1';
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000000c1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Submit an application exactly like the public form does; `overrides`
-- replaces fields of a valid baseline.
create function pg_temp.submit(overrides jsonb default '{}') returns void language plpgsql as $$
declare r public.applications;
begin
  r := jsonb_populate_record(null::public.applications, jsonb_build_object(
    'locale', 'tr', 'full_name', 'Deniz Yılmaz', 'phone', '+905321234567',
    'email', 'Deniz@PGTAP.invalid ', 'birth_date', '1995-05-17', 'city', 'İstanbul',
    'district', 'Kadıköy', 'side', 'asian', 'languages', array['tr','en'],
    'license_class', 'a2', 'riding_years', 3, 'owns_motorcycle', true,
    'motorcycle_brand', 'Honda', 'motorcycle_model', 'CB650R', 'motorcycle_cc', 650,
    'riding_styles', array['city','touring'], 'group_experience', 'some',
    'in_other_clubs', false, 'heard_from', 'instagram_ad',
    'event_interests', array['day_rides','coffee_meetups'],
    'expectations', 'Güvenli grup sürüşleri ve yeni arkadaşlar.',
    'alienating_behaviors', 'Kural tanımayan, tehlikeli sürüş.',
    'consent_privacy', true, 'consent_rules', true, 'consent_photos', false,
    'privacy_notice_version', 'test', 'utm_source', 'instagram', 'utm_campaign', 'nov-2026'
  ) || overrides);

  insert into public.applications (
    locale, full_name, phone, email, birth_date, city, district, side, instagram, languages,
    license_class, riding_years, owns_motorcycle, motorcycle_brand, motorcycle_model, motorcycle_cc,
    riding_styles, group_experience, in_other_clubs, other_club_names, heard_from, referrer_name,
    event_interests, expectations, alienating_behaviors, consent_privacy, consent_rules,
    consent_photos, privacy_notice_version, utm_source, utm_medium, utm_campaign, utm_content, utm_term
  ) values (
    r.locale, r.full_name, r.phone, r.email, r.birth_date, r.city, r.district, r.side, r.instagram, r.languages,
    r.license_class, r.riding_years, r.owns_motorcycle, r.motorcycle_brand, r.motorcycle_model, r.motorcycle_cc,
    r.riding_styles, r.group_experience, r.in_other_clubs, r.other_club_names, r.heard_from, r.referrer_name,
    r.event_interests, r.expectations, r.alienating_behaviors, r.consent_privacy, r.consent_rules,
    r.consent_photos, r.privacy_notice_version, r.utm_source, r.utm_medium, r.utm_campaign, r.utm_content, r.utm_term
  );
end;
$$;
grant execute on function pg_temp.submit(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Anonymous visitor (the public form)
-- ---------------------------------------------------------------------------
set local role anon;

select lives_ok($$ select pg_temp.submit() $$, 'anon can submit a valid application');

select throws_ok(
  $$ select id from public.applications where email like '%@pgtap.invalid' $$,
  '42501', null,
  'anon cannot read applications'
);

select throws_ok(
  $$ insert into public.applications (full_name, status) values ('x', 'approved') $$,
  '42501', null,
  'anon cannot set the status column'
);

select throws_ok(
  $$ select pg_temp.submit('{"email": "deniz@pgtap.invalid"}') $$,
  '23505', null,
  'a second open application with the same email (case-insensitive) is rejected'
);

select throws_ok(
  $$ select pg_temp.submit(jsonb_build_object('email', 'young@pgtap.invalid',
       'birth_date', ((now() at time zone 'Europe/Istanbul')::date - interval '18 years' + interval '1 day')::date)) $$,
  '23514', null,
  'applicants under 18 are rejected'
);

select throws_ok(
  $$ select pg_temp.submit('{"email": "nobike@pgtap.invalid", "motorcycle_brand": null}') $$,
  '23514', null,
  'owning a motorcycle requires brand and model'
);

select throws_ok(
  $$ select pg_temp.submit('{"email": "noconsent@pgtap.invalid", "consent_privacy": false}') $$,
  '23514', null,
  'privacy notice acknowledgement is required'
);

select throws_ok(
  $$ select pg_temp.submit('{"email": "badstyle@pgtap.invalid", "riding_styles": ["drifting"]}') $$,
  '23514', null,
  'unknown riding styles are rejected'
);

select throws_ok(
  $$ select pg_temp.submit('{"email": "badphone@pgtap.invalid", "phone": "0532 123 45 67"}') $$,
  '23514', null,
  'phone numbers must be normalized to E.164'
);
reset role;

select is(
  (select email || '|' || status from public.applications where email like '%@pgtap.invalid'),
  'deniz@pgtap.invalid|new',
  'email is trimmed and lowercased, status starts as new'
);

-- ---------------------------------------------------------------------------
-- Active member (not staff)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000c1');

select is((select count(*)::int from public.applications where email like '%@pgtap.invalid'), 0, 'members cannot see applications');

update public.applications set status = 'approved' where email like '%@pgtap.invalid';
reset role;
select is((select status::text from public.applications where email like '%@pgtap.invalid'), 'new', 'members cannot change applications');

-- ---------------------------------------------------------------------------
-- Organizer (staff)
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000b1');

select is((select count(*)::int from public.applications where email like '%@pgtap.invalid'), 1, 'organizers can read applications');

select lives_ok(
  $$ update public.applications set status = 'contacted', admin_notes = 'Called on WhatsApp' where email like '%@pgtap.invalid' $$,
  'organizers can update status and notes'
);

select throws_ok(
  $$ update public.applications set full_name = 'Changed' where email like '%@pgtap.invalid' $$,
  '42501', null,
  'organizers cannot edit applicant answers'
);

delete from public.applications where email like '%@pgtap.invalid';
reset role;

select is(
  (select reviewed_by::text || '|' || (reviewed_at is not null)::text || '|' || status from public.applications where email like '%@pgtap.invalid'),
  '00000000-0000-0000-0000-0000000000b1|true|contacted',
  'status change records reviewer and time; organizer delete had no effect'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000000a1');
delete from public.applications where email like '%@pgtap.invalid';
reset role;

select is((select count(*)::int from public.applications where email like '%@pgtap.invalid'), 0, 'admins can delete applications (KVKK erasure)');

-- Re-applying is allowed once the previous application is decided.
set local role anon;
select lives_ok($$ select pg_temp.submit() $$, 're-applying works when no open application exists');
reset role;

select * from finish();
rollback;
