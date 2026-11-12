-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures (postgres bypasses RLS). Ids 0000…0601–0606, roles 0651/0652; every query is scoped to them.
-- 601 owner (active), 602 other active, 603 members.manage, 604 members.safety, 605 pending, 606 inactive.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000601', 'pgtap-sc-owner@pgtap.invalid',    '{"full_name": "Olcay Owner"}'),
  ('00000000-0000-0000-0000-000000000602', 'pgtap-sc-other@pgtap.invalid',    '{"full_name": "Orhan Other"}'),
  ('00000000-0000-0000-0000-000000000603', 'pgtap-sc-manager@pgtap.invalid',  '{"full_name": "Mine Manager"}'),
  ('00000000-0000-0000-0000-000000000604', 'pgtap-sc-safety@pgtap.invalid',   '{"full_name": "Selin Safety"}'),
  ('00000000-0000-0000-0000-000000000605', 'pgtap-sc-pending@pgtap.invalid',  '{"full_name": "Pelin Pending"}'),
  ('00000000-0000-0000-0000-000000000606', 'pgtap-sc-inactive@pgtap.invalid', '{"full_name": "Ilgın Inactive"}');

insert into public.roles (id, name) values
  ('00000000-0000-0000-0000-000000000651', 'pgtap-sc-manager'),
  ('00000000-0000-0000-0000-000000000652', 'pgtap-sc-safety');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-000000000651', 'members.manage'),
  ('00000000-0000-0000-0000-000000000652', 'members.safety');
update public.profiles set status = 'active'
  where id in ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000602');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000651'
  where id = '00000000-0000-0000-0000-000000000603';
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-000000000652'
  where id = '00000000-0000-0000-0000-000000000604';
update public.profiles set status = 'inactive' where id = '00000000-0000-0000-0000-000000000606';

-- The inactive member already has a contact (seeded as postgres).
insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
  values ('00000000-0000-0000-0000-000000000606', 1, 'Eski Kişi', 'friend', '+905320000000');

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- "<sqlstate>|<constraint>" of the error a statement raises (empty when it succeeds).
create function pg_temp.error_of(stmt text) returns text language plpgsql as $$
declare s text; c text;
begin
  execute stmt;
  return '';
exception when others then
  get stacked diagnostics c = constraint_name;
  s = sqlstate;
  return s || '|' || coalesce(c, '');
end $$;

select ok('members.safety' = any(enum_range(null::public.permission)::text[]), 'members.safety is a permission');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.member_emergency_contacts'::regclass),
  'RLS is enabled on member_emergency_contacts'
);

-- Phone helper
select is(private.is_valid_phone('+905321234567'), true, 'TR mobile is valid');
select is(private.is_valid_phone('+902161234567'), false, 'TR landline is invalid');
select is(private.is_valid_phone('+4915123456789'), true, 'foreign E.164 number is valid');
select is(private.is_valid_phone('05321234567'), false, 'national format is invalid');
select is(private.is_valid_phone('+90532'), false, 'too short is invalid');

-- Anonymous
set local role anon;
select throws_ok('select * from public.member_emergency_contacts', '42501', null, 'anon cannot read contacts');
select is(
  pg_temp.error_of($$ insert into public.applications (
      full_name, phone, email, birth_date, district, side, languages, license_class, riding_years, owns_motorcycle,
      riding_styles, group_experience, in_other_clubs, heard_from, event_interests, expectations,
      alienating_behaviors, consent_privacy, consent_rules, privacy_notice_version
    ) values (
      'Aday Kişi', '+902161234567', 'pgtap-sc-landline@pgtap.invalid', '1995-05-17', 'Kadıköy', 'asian', array['tr'],
      'a2', 3, false, array['city'], 'some', false, 'friend', array['day_rides'], 'Güvenli grup sürüşleri.',
      'Tehlikeli sürüş.', true, true, 'test') $$),
  '23514|applications_tr_mobile',
  'anon application with a +90 landline still fails with applications_tr_mobile'
);
reset role;

-- Owner (active)
select pg_temp.login('00000000-0000-0000-0000-000000000601');
select lives_ok(
  $$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 1, 'Ayşe Yılmaz', 'parent', '+905321234567') $$,
  'owner inserts contact 1'
);
select lives_ok(
  $$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 2, 'Ayşe Yılmaz', 'parent', '+905321234567') $$,
  'owner inserts contact 2'
);
select is(
  pg_temp.error_of($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 2, 'Üçüncü', 'friend', '+905321234567') $$),
  '23505|member_emergency_contacts_position_key',
  'a second contact in position 2 is rejected'
);
select is(
  pg_temp.error_of($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 3, 'Üçüncü', 'friend', '+905321234567') $$),
  '23514|member_emergency_contacts_position_check',
  'position 3 is rejected'
);
select is(
  pg_temp.error_of($$ update public.member_emergency_contacts set phone = '+902161234567'
      where profile_id = '00000000-0000-0000-0000-000000000601' and position = 1 $$),
  '23514|member_emergency_contacts_phone',
  'updating to a TR landline is rejected (member_emergency_contacts_phone)'
);
select lives_ok(
  $$ delete from public.member_emergency_contacts
      where profile_id = '00000000-0000-0000-0000-000000000601' and position = 1 $$,
  'owner deletes contact 1'
);
select is(
  pg_temp.error_of($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 1, 'Yeni', 'friend', '+902161234567') $$),
  '23514|member_emergency_contacts_phone',
  'insert with a TR landline is rejected (member_emergency_contacts_phone)'
);
select is(
  pg_temp.error_of($$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 1, '   ', 'friend', '+905321234567') $$),
  '23514|member_emergency_contacts_name_check',
  'blank name is rejected'
);
select lives_ok(
  $$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000601', 1, 'Ali Veli', 'sibling', '+4915123456789') $$,
  'owner re-inserts position 1'
);
select lives_ok(
  $$ update public.member_emergency_contacts set name = 'Ali Veli Yeni', relationship = 'friend', phone = '+905329998877'
      where profile_id = '00000000-0000-0000-0000-000000000601' and position = 1 $$,
  'owner updates name, relationship and phone'
);
select throws_ok(
  $$ update public.member_emergency_contacts set position = 1
      where profile_id = '00000000-0000-0000-0000-000000000601' and position = 2 $$,
  '42501', null, 'position cannot be updated (no grant)'
);

-- Other members, staff roles: no read access
select pg_temp.login('00000000-0000-0000-0000-000000000602');
select is(
  (select count(*)::int from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-000000000601'),
  0, 'another active member sees none of the owner''s contacts'
);
select pg_temp.login('00000000-0000-0000-0000-000000000603');
select is(
  (select count(*)::int from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-000000000601'),
  0, 'members.manage does not read contacts'
);
select pg_temp.login('00000000-0000-0000-0000-000000000604');
select is(
  (select count(*)::int from public.member_emergency_contacts where profile_id = '00000000-0000-0000-0000-000000000601'),
  0, 'members.safety does not read contacts directly (RPC only)'
);

-- Pending and inactive cannot write; inactive may delete their own
select pg_temp.login('00000000-0000-0000-0000-000000000605');
select throws_ok(
  $$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000605', 1, 'Kişi', 'friend', '+905321234567') $$,
  '42501', null, 'pending member cannot insert'
);
select pg_temp.login('00000000-0000-0000-0000-000000000606');
select throws_ok(
  $$ insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
     values ('00000000-0000-0000-0000-000000000606', 2, 'Kişi', 'friend', '+905321234567') $$,
  '42501', null, 'inactive member cannot insert'
);
with d as (delete from public.member_emergency_contacts
            where profile_id = '00000000-0000-0000-0000-000000000606' returning 1)
select is((select count(*)::int from d), 1, 'inactive member deletes their own contact');

select * from finish();
rollback;
