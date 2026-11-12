-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(38);

-- Fixtures (postgres bypasses RLS). Ids 0000…0631–0638, roles 0655/0656; every query is scoped to them.
-- 631 viewer, 632 safety holder, 633 member (contact, 0-, plate shown), 634 member (plate hidden, no contact),
-- 635 inactive with contact, 636 inactive safety holder, 637 members.manage only, 638 second 0- member (cursor test).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000631', 'pgtap-sd-viewer@pgtap.invalid',   '{"full_name": "Vedat Viewer"}'),
  ('00000000-0000-0000-0000-000000000632', 'pgtap-sd-safety@pgtap.invalid',   '{"full_name": "Selim Safety"}'),
  ('00000000-0000-0000-0000-000000000633', 'pgtap-sd-contact@pgtap.invalid',  '{"full_name": "Cemal Pgtapsd Contact"}'),
  ('00000000-0000-0000-0000-000000000634', 'pgtap-sd-nocontact@pgtap.invalid', '{"full_name": "Nuri Pgtapsd Nocontact"}'),
  ('00000000-0000-0000-0000-000000000638', 'pgtap-sd-twin@pgtap.invalid',     '{"full_name": "Cemal Pgtapsd Twin"}'),
  ('00000000-0000-0000-0000-000000000635', 'pgtap-sd-inactive@pgtap.invalid', '{"full_name": "Ilker Inactive"}'),
  ('00000000-0000-0000-0000-000000000636', 'pgtap-sd-inactsafe@pgtap.invalid', '{"full_name": "Sabri Inactsafe"}'),
  ('00000000-0000-0000-0000-000000000637', 'pgtap-sd-manager@pgtap.invalid',  '{"full_name": "Mehmet Manager"}');

insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-000000000655', 'pgtap-sd-safety'),
  ('00000000-0000-0000-0000-000000000656', 'pgtap-sd-manage');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000655', 'members.safety'),
  ('00000000-0000-0000-0000-000000000656', 'members.manage');

update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000633',
               '00000000-0000-0000-0000-000000000634', '00000000-0000-0000-0000-000000000638');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000655'
  where id = '00000000-0000-0000-0000-000000000632';
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000656'
  where id = '00000000-0000-0000-0000-000000000637';
update public.profiles set status = 'inactive'
  where id in ('00000000-0000-0000-0000-000000000635');
update public.profiles set status = 'inactive', role_id = '00000000-0000-0000-0000-000000000655'
  where id = '00000000-0000-0000-0000-000000000636';

update public.member_details set show_plates = false where profile_id = '00000000-0000-0000-0000-000000000634';

insert into public.member_motorcycles (profile_id, brand, model, cc, plate) values
  ('00000000-0000-0000-0000-000000000633', 'Yamaha', 'MT-07', 689, '34 ABC 123'),
  ('00000000-0000-0000-0000-000000000634', 'Honda', 'CB', 500, '34 XYZ 789');
insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone) values
  ('00000000-0000-0000-0000-000000000633', 2, 'Zeynep Contact', 'friend', '+905551112233'),
  ('00000000-0000-0000-0000-000000000633', 1, 'Ali Contact', 'parent', '+905551112244'),
  ('00000000-0000-0000-0000-000000000635', 1, 'Inactive Contact', 'sibling', '+905551112255');
insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values ('00000000-0000-0000-0000-000000000633', '0-', true, now(), 'v1'),
         ('00000000-0000-0000-0000-000000000638', '0-', true, now(), 'v1');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
declare s text;
begin
  execute stmt;
  return '';
exception when others then
  s = sqlstate;
  return s;
end $$;

-- Only the new signatures exist
select is((select count(*)::int from pg_proc where oid::regprocedure::text like 'member_directory(%' and pronamespace = 'public'::regnamespace),
  1, 'exactly one member_directory');
select is((select count(*)::int from pg_proc where oid::regprocedure::text like 'member_directory_counts(%' and pronamespace = 'public'::regnamespace),
  1, 'exactly one member_directory_counts');

select is(has_function_privilege('anon', 'public.member_directory(text, public.istanbul_side, text, uuid, int, public.blood_type, boolean)', 'execute'), false, 'anon cannot execute member_directory');
select is(has_function_privilege('anon', 'public.member_directory_counts(text, public.blood_type, boolean)', 'execute'), false, 'anon cannot execute member_directory_counts');
select is(has_function_privilege('anon', 'public.member_safety_card(uuid)', 'execute'), false, 'anon cannot execute member_safety_card');
select is(has_function_privilege('authenticated', 'public.member_safety_card(uuid)', 'execute'), true, 'authenticated can execute member_safety_card');

-- Viewer: plates follow the switch, no safety data
select pg_temp.login('00000000-0000-0000-0000-000000000631');
select is(
  (select motorcycles->0->>'plate' from public.member_directory(search => 'Cemal')
    where id = '00000000-0000-0000-0000-000000000633'),
  '34 ABC 123', 'viewer sees the plate when show_plates is on');
select is(
  (select motorcycles->0 ? 'plate' from public.member_directory(search => 'Nuri')
    where id = '00000000-0000-0000-0000-000000000634'),
  true, 'the plate key is present when hidden');
select is(
  (select count(*)::int from public.member_directory(search => 'Nuri')
    where id = '00000000-0000-0000-0000-000000000634' and motorcycles->0->>'plate' is null),
  1, 'viewer sees a null plate when show_plates is off (row present)');
select is(
  (select count(*)::int from public.member_directory(search => 'pgtap-never') ), 0, 'search still filters');
select is(
  (select count(*)::int from public.member_directory(search => 'Cemal')
    where id = '00000000-0000-0000-0000-000000000633' and has_emergency_contact is null),
  1, 'has_emergency_contact is null for the viewer (row present)');
select is(pg_temp.error_of($$ select * from public.member_directory(blood_filter => '0-') $$), '42501', 'viewer: blood filter -> 42501');
select is(pg_temp.error_of($$ select * from public.member_directory(no_contact => true) $$), '42501', 'viewer: no_contact -> 42501');
select is(pg_temp.error_of($$ select * from public.member_directory_counts(blood_filter => '0-') $$), '42501', 'viewer: counts blood filter -> 42501');
select is(pg_temp.error_of($$ select * from public.member_directory_counts(no_contact => true) $$), '42501', 'viewer: counts no_contact -> 42501');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000633') $$), '42501', 'viewer: card -> 42501');

-- Safety holder
select pg_temp.login('00000000-0000-0000-0000-000000000632');
select results_eq(
  $$ select id::text, has_emergency_contact from public.member_directory()
      where id in ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000634') order by id $$,
  $$ values ('00000000-0000-0000-0000-000000000633', true), ('00000000-0000-0000-0000-000000000634', false) $$,
  'holder sees has_emergency_contact');
select results_eq(
  $$ select id::text from public.member_directory(blood_filter => '0-')
      where id in ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000634') $$,
  $$ values ('00000000-0000-0000-0000-000000000633') $$,
  'blood filter returns the 0- member only');
select results_eq(
  $$ select id::text from public.member_directory(no_contact => true)
      where id in ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000634') $$,
  $$ values ('00000000-0000-0000-0000-000000000634') $$,
  'no_contact returns the member without contacts only');
select is((select total::int from public.member_directory_counts(search => 'Cemal Pgtapsd Contact', blood_filter => '0-')), 1, 'counts: blood filter matches');
select is((select total::int from public.member_directory_counts(search => 'Nuri', blood_filter => '0-')), 0, 'counts: blood filter excludes');
select is((select total::int from public.member_directory_counts(search => 'Nuri', no_contact => true)), 1, 'counts: no_contact matches');
select is((select total::int from public.member_directory_counts(search => 'Cemal Pgtapsd Contact', no_contact => true)), 0, 'counts: no_contact excludes');

-- Blood filter with the keyset cursor (page_size 1 returns the page plus one peek row)
create temp table sd_page1 on commit drop as
  select id, full_name from public.member_directory(search => 'pgtapsd', blood_filter => '0-', page_size => 1);
select results_eq(
  $$ select id::text from sd_page1 order by full_name collate "tr-x-icu", id $$,
  $$ values ('00000000-0000-0000-0000-000000000633'), ('00000000-0000-0000-0000-000000000638') $$,
  'page 1 holds both 0- fixtures and not the non-0- one');
select results_eq(
  $$ select id::text from public.member_directory(search => 'pgtapsd', blood_filter => '0-', page_size => 1,
       after_name => (select full_name from sd_page1 order by full_name collate "tr-x-icu", id limit 1),
       after_id => (select id from sd_page1 order by full_name collate "tr-x-icu", id limit 1)) $$,
  $$ values ('00000000-0000-0000-0000-000000000638') $$,
  'page 2 after the first row holds the second 0- fixture only');
select is((select count(*)::int from sd_page1 where id = '00000000-0000-0000-0000-000000000634'), 0,
  'the non-0- member never appears under the blood filter');

-- Card
select results_eq(
  $$ select full_name, contacts->0->>'position', contacts->0->>'name', contacts->0->>'relationship',
            contacts->1->>'position', jsonb_array_length(contacts)::text, blood_type::text,
            motorcycles->0->>'plate'
       from public.member_safety_card('00000000-0000-0000-0000-000000000633') $$,
  $$ values ('Cemal Pgtapsd Contact', '1', 'Ali Contact', 'parent', '2', '2', '0-', '34 ABC 123') $$,
  'card: contacts by position, blood type and plate');
select results_eq(
  $$ select motorcycles->0->>'plate', jsonb_array_length(contacts)::text, blood_type::text
       from public.member_safety_card('00000000-0000-0000-0000-000000000634') $$,
  $$ values ('34 XYZ 789', '0', null) $$,
  'card: plate shown although hidden in the directory; no contacts, no blood type');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000635') $$), 'P0002', 'card: inactive target -> P0002');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000699') $$), 'P0002', 'card: unknown target -> P0002');
-- Others cannot open a card
select pg_temp.login('00000000-0000-0000-0000-000000000636');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000633') $$), '42501', 'inactive safety holder: card -> 42501');
select pg_temp.login('00000000-0000-0000-0000-000000000637');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000633') $$), '42501', 'members.manage only: card -> 42501');

-- Access log (readable by admins only: look as postgres)
select set_config('role', 'postgres', true);
select results_eq(
  $$ select actor_id::text, target_id::text, detail from public.safety_access_log
      where action = 'filter_blood_type' and actor_id = '00000000-0000-0000-0000-000000000632' $$,
  $$ values ('00000000-0000-0000-0000-000000000632', null, '0-'), ('00000000-0000-0000-0000-000000000632', null, '0-'),
            ('00000000-0000-0000-0000-000000000632', null, '0-') $$,
  'three filter_blood_type rows (one per blood-filter call); no_contact and counts logged none');
select results_eq(
  $$ select actor_id::text, target_id::text from public.safety_access_log
      where action = 'view_card' and actor_id = '00000000-0000-0000-0000-000000000632'
        and target_id in ('00000000-0000-0000-0000-000000000633', '00000000-0000-0000-0000-000000000635')
      order by target_id $$,
  $$ values ('00000000-0000-0000-0000-000000000632', '00000000-0000-0000-0000-000000000633') $$,
  'view_card logged for 633 only (the P0002 call left no row)');
select is(
  (select count(*)::int from public.safety_access_log
    where actor_id in ('00000000-0000-0000-0000-000000000631', '00000000-0000-0000-0000-000000000636',
                       '00000000-0000-0000-0000-000000000637')),
  0, 'denied calls left no log rows');

-- Anon
select set_config('role', 'anon', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(pg_temp.error_of($$ select * from public.member_directory() $$), '42501', 'anon: directory -> 42501');
select is(pg_temp.error_of($$ select * from public.member_directory_counts() $$), '42501', 'anon: counts -> 42501');
select is(pg_temp.error_of($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000633') $$), '42501', 'anon: card -> 42501');

select * from finish();
rollback;
