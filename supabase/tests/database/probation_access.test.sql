-- Run with: pnpm db:test
-- Ön alım (probation) rights: own-row writes like a full member, no reads of other members, the crowd view
-- (club_overview), visibility of probation members to full members vs. members.manage / members.safety staff,
-- and the purge of a deleted probation account.
begin;
create extension if not exists pgtap with schema extensions;

select plan(49);

-- Fixtures: 0711 probation; 0712 active (asian); 0713 active with members.safety; 0714 active with members.manage;
-- 0715 pending; initials fixtures (active) 0716 'Ayşe' (european), 0717 '  ali   veli ', 0718 'irem işık', 0719 '';
-- 0720 counting fixture (starts pending, asian); 0721 deleting (was probation) with approved application 0722.
-- Roles 071a (members.safety) and 071b (members.manage).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000711', 'pgtap-pa-probation@pgtap.invalid', '{"full_name": "Pelin Pgtaponalim"}'),
  ('00000000-0000-0000-0000-000000000712', 'pgtap-pa-member@pgtap.invalid',    '{"full_name": "Mert Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000713', 'pgtap-pa-safety@pgtap.invalid',    '{"full_name": "Selin Pgtapguvenlik"}'),
  ('00000000-0000-0000-0000-000000000714', 'pgtap-pa-manager@pgtap.invalid',   '{"full_name": "Mina Pgtapyetkili"}'),
  ('00000000-0000-0000-0000-000000000715', 'pgtap-pa-pending@pgtap.invalid',   '{"full_name": "Pınar Pgtapbekleyen"}'),
  ('00000000-0000-0000-0000-000000000716', 'pgtap-pa-ayse@pgtap.invalid',      '{"full_name": "Ayşe"}'),
  ('00000000-0000-0000-0000-000000000717', 'pgtap-pa-ali@pgtap.invalid',       '{"full_name": "Ali Veli"}'),
  ('00000000-0000-0000-0000-000000000718', 'pgtap-pa-irem@pgtap.invalid',      '{"full_name": "İrem Işık"}'),
  ('00000000-0000-0000-0000-000000000719', 'pgtap-pa-empty@pgtap.invalid',     '{"full_name": ""}'),
  ('00000000-0000-0000-0000-000000000720', 'pgtap-pa-count@pgtap.invalid',     '{"full_name": "Cem Pgtapsayac"}'),
  ('00000000-0000-0000-0000-000000000721', 'pgtap-pa-deleting@pgtap.invalid',  '{"full_name": "Defne Pgtapsiliniyor"}');
insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-00000000071a', 'pgtap-pa-safety'),
  ('00000000-0000-0000-0000-00000000071b', 'pgtap-pa-manager');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-00000000071a', 'members.safety'),
  ('00000000-0000-0000-0000-00000000071b', 'members.manage');

update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000711';
update public.profiles set status = 'active', side = 'asian' where id = '00000000-0000-0000-0000-000000000712';
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-00000000071a'
  where id = '00000000-0000-0000-0000-000000000713';
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-00000000071b'
  where id = '00000000-0000-0000-0000-000000000714';
update public.profiles set status = 'active', side = 'european' where id = '00000000-0000-0000-0000-000000000716';
-- Names set after the insert: staff corrections are stored as typed (the tidy trigger runs on insert only).
update public.profiles set status = 'active', full_name = '  ali   veli ' where id = '00000000-0000-0000-0000-000000000717';
update public.profiles set status = 'active', full_name = 'irem işık' where id = '00000000-0000-0000-0000-000000000718';
update public.profiles set status = 'active', full_name = '' where id = '00000000-0000-0000-0000-000000000719';
update public.profiles set side = 'asian' where id = '00000000-0000-0000-0000-000000000720';

-- The pending fixture already has a bike and an emergency contact (planted), to test updates and deletes.
insert into public.member_motorcycles (id, profile_id, brand, model)
  values ('00000000-0000-0000-0000-0000000007b1', '00000000-0000-0000-0000-000000000715', 'Vespa', 'GTS');
insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
  values ('00000000-0000-0000-0000-000000000715', 1, 'Eski Kişi', 'friend', '+905320000715');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

create temp table overview_before (total integer, asian integer, european integer);
grant all on overview_before to authenticated;

-- Grants
select ok(not has_function_privilege('anon', 'public.club_overview()', 'execute'), 'anon cannot call club_overview');
select ok(has_function_privilege('authenticated', 'public.club_overview()', 'execute'),
  'authenticated may call club_overview (the function checks the status)');
select ok(not has_function_privilege('anon', 'private.is_club_member()', 'execute'), 'anon cannot call is_club_member');

-- ---------------------------------------------------------------------------
-- 0711 (probation): own rows
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000711');
select is(private.is_club_member(), true, 'probation is a club member');
select is(private.is_active_member(), false, 'probation is not a full member');
select lives_ok($$ insert into public.member_motorcycles (profile_id, brand, model)
  values ('00000000-0000-0000-0000-000000000711', 'Honda', 'PCX') $$, 'probation adds own bike');
update public.member_motorcycles set model = 'PCX 160' where profile_id = '00000000-0000-0000-0000-000000000711';
select is((select model from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-000000000711'),
  'PCX 160', 'probation updates own bike');
insert into public.member_motorcycles (profile_id, brand, model)
  values ('00000000-0000-0000-0000-000000000711', 'Yamaha', 'MT-07');
delete from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-000000000711' and brand = 'Yamaha';
select is((select count(*) from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-000000000711'),
  1::bigint, 'probation deletes own bike');
select lives_ok($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
  values ('00000000-0000-0000-0000-000000000711', 1, 'Yakın Kişi', 'sibling', '+905320000711') $$,
  'probation adds own emergency contact');
update public.member_emergency_contacts set name = 'Yakın Kişi İki'
  where profile_id = '00000000-0000-0000-0000-000000000711';
select is((select name from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-000000000711'),
  'Yakın Kişi İki', 'probation updates own emergency contact');
select lives_ok($$ select public.set_my_birth_date('1990-01-01') $$, 'probation sets own birth date once');
select lives_ok($$ select public.set_my_blood_type('A+', 'v') $$, 'probation sets own blood type');

-- 0711 can't see others
select is((select count(*) from public.profiles
  where id <> '00000000-0000-0000-0000-000000000711' and id::text like '00000000-0000-0000-0000-0000000007%'),
  0::bigint, 'probation reads no other profiles');
select throws_ok($$ select * from public.member_directory() $$, '42501', null, 'probation cannot call member_directory');

-- Crowd view
select ok((select total >= 7 from public.club_overview()), 'club_overview counts the active fixtures (real rows add more)');
select ok((select asian >= 1 and european >= 1 and asian + european <= total from public.club_overview()),
  'side counts are part of the total');
select ok((select 'A' = any(initials) and 'AV' = any(initials) and 'İİ' = any(initials) from public.club_overview()),
  'initials: one word, extra spaces, Turkish i');
select ok((select not ('' = any(initials)) and array_position(initials, null) is null from public.club_overview()),
  'empty names have no initials');
select ok((select cardinality(initials) <= total - 1 from public.club_overview()),
  'at most one initials entry per counted member, none for the empty name');
insert into overview_before select total, asian, european from public.club_overview();
reset role;

-- Counting: probation members are not counted, active ones are; members without a side only in the total
update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000720';
select pg_temp.login('00000000-0000-0000-0000-000000000711');
select ok((select o.total = b.total and o.asian = b.asian and o.european = b.european
  from public.club_overview() o, overview_before b), 'a probation member is not counted');
reset role;
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-000000000720';
select pg_temp.login('00000000-0000-0000-0000-000000000711');
select ok((select o.total = b.total + 1 and o.asian = b.asian + 1 and o.european = b.european
  from public.club_overview() o, overview_before b), 'an active member is counted, on their side');
reset role;
update public.profiles set side = null where id = '00000000-0000-0000-0000-000000000720';
select pg_temp.login('00000000-0000-0000-0000-000000000711');
select ok((select o.total = b.total + 1 and o.asian = b.asian and o.european = b.european
  from public.club_overview() o, overview_before b), 'a member without a side is only in the total');
reset role;

-- ---------------------------------------------------------------------------
-- 0715 (pending): no own-row writes, no crowd view
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000715');
select is(private.is_club_member(), false, 'pending is not a club member');
select throws_ok($$ insert into public.member_motorcycles (profile_id, brand, model)
  values ('00000000-0000-0000-0000-000000000715', 'Honda', 'PCX') $$, '42501', null, 'pending cannot add a bike');
update public.member_motorcycles set model = 'GTS 300' where profile_id = '00000000-0000-0000-0000-000000000715';
delete from public.member_motorcycles where profile_id = '00000000-0000-0000-0000-000000000715';
select throws_ok($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
  values ('00000000-0000-0000-0000-000000000715', 2, 'Yakın Kişi', 'friend', '+905320000716') $$,
  '42501', null, 'pending cannot add an emergency contact');
update public.member_emergency_contacts set name = 'Yeni Kişi'
  where profile_id = '00000000-0000-0000-0000-000000000715';
select throws_ok($$ select public.set_my_birth_date('1990-01-01') $$, '42501', null, 'pending cannot set a birth date');
select throws_ok($$ select public.set_my_blood_type('A+', 'v') $$, '42501', null, 'pending cannot set a blood type');
select throws_ok($$ select * from public.club_overview() $$, '42501', null, 'pending cannot call club_overview');
reset role;
select is((select model from public.member_motorcycles where id = '00000000-0000-0000-0000-0000000007b1'),
  'GTS', 'pending neither updates nor deletes own bike');
select is((select name from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-000000000715'),
  'Eski Kişi', 'pending does not update own emergency contact');

-- ---------------------------------------------------------------------------
-- 0712 (full member): no crowd view, doesn't see probation members
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000712');
select is(private.is_club_member(), true, 'a full member is a club member');
select throws_ok($$ select * from public.club_overview() $$, '42501', null, 'a full member cannot call club_overview');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000711'), 0::bigint,
  'full member does not read a probation profile');
select is((select count(*) from public.member_directory() where id = '00000000-0000-0000-0000-000000000711'), 0::bigint,
  'full member directory hides probation');
select is((select probation from public.member_directory() where id = '00000000-0000-0000-0000-000000000712'), false,
  'full members are not flagged');
reset role;

-- ---------------------------------------------------------------------------
-- 0713 (members.safety): sees probation members flagged, opens their safety card
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000713');
select is((select probation from public.member_directory() where id = '00000000-0000-0000-0000-000000000711'), true,
  'safety holder sees probation flagged');
select is((select probation from public.member_directory() where id = '00000000-0000-0000-0000-000000000712'), false,
  'safety holder: full members are not flagged');
select is((select has_emergency_contact from public.member_directory()
  where id = '00000000-0000-0000-0000-000000000711'), true, 'safety holder sees the probation member''s contact flag');
select is((select count(*) from public.member_directory() where id = '00000000-0000-0000-0000-000000000715'), 0::bigint,
  'safety holder does not see pending accounts in the directory');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-000000000711'), 0::bigint,
  'safety holder still cannot read a probation profile directly');
select lives_ok($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000711') $$,
  'safety card opens for probation');
select is((select jsonb_array_length(contacts) from public.member_safety_card('00000000-0000-0000-0000-000000000711')),
  1, 'the probation safety card holds the contact');
select throws_ok($$ select * from public.member_safety_card('00000000-0000-0000-0000-000000000715') $$,
  'P0002', null, 'safety card does not open for a pending account');
select throws_ok($$ select * from public.club_overview() $$, '42501', null, 'staff cannot call club_overview');
reset role;

-- ---------------------------------------------------------------------------
-- 0714 (members.manage): sees probation members flagged
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000714');
select is((select probation from public.member_directory() where id = '00000000-0000-0000-0000-000000000711'), true,
  'manage holder sees probation flagged');
select is((select has_emergency_contact from public.member_directory()
  where id = '00000000-0000-0000-0000-000000000711'), null, 'manage holder without members.safety gets no contact flag');
select is((select count(*) from public.member_directory() where id = '00000000-0000-0000-0000-000000000715'), 0::bigint,
  'manage holder does not see pending accounts in the directory');
reset role;

-- ---------------------------------------------------------------------------
-- Purge: a deleted account that was in probation loses its approved application (only inactive keeps it).
-- Requested long ago and purged "as of" then, so no real account is due in this run.
-- ---------------------------------------------------------------------------
update public.profiles
  set status = 'deleting', deletion_requested_at = '2000-01-01 00:00:00+00', status_before_deletion = 'probation'
  where id = '00000000-0000-0000-0000-000000000721';
insert into public.applications (
  id, status, profile_id, full_name, phone, email, birth_date, district, side, languages, license_class,
  riding_years, owns_motorcycle, riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
  expectations, alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
) values (
  '00000000-0000-0000-0000-000000000722', 'approved', '00000000-0000-0000-0000-000000000721', 'Defne Aday',
  '+905321234567', 'pgtap-pa-deleting@pgtap.invalid', '1995-05-17', 'Kadıköy', 'asian', array['tr'], 'a2', 3, false,
  array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.', 'Tehlikeli sürüş.',
  true, true, 'test'
);
select private.purge_deleted_accounts('2000-01-15 00:00:00+00');
select is((select count(*) from auth.users where id = '00000000-0000-0000-0000-000000000721'), 0::bigint,
  'the deleted probation account is purged');
select is((select count(*) from public.applications where id = '00000000-0000-0000-0000-000000000722'), 0::bigint,
  'its approved application is deleted, not kept');

select * from finish();
rollback;
