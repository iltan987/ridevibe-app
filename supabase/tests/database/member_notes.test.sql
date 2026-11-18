-- Run with: pnpm db:test
-- Staff notes about members (members.notes): visibility, author forced to the caller, no updates, admin-only deletes,
-- notes about admins only for admins, never about oneself or a deleting account.
begin;
create extension if not exists pgtap with schema extensions;

select plan(42);

-- Fixtures: 0731 admin A, 0732 admin B, 0733 notes holder, 0734 active without the permission, 0735 subject (active),
-- 0736 subject in deleting, 0737 probation member holding a role with members.notes, 0738 pending subject,
-- 0739 probation subject, 073b inactive holder of the admin role.
-- Roles 073a (members.notes).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000731', 'pgtap-mn-admin-a@pgtap.invalid',  '{"full_name": "Aylin Pgtapyonetici"}'),
  ('00000000-0000-0000-0000-000000000732', 'pgtap-mn-admin-b@pgtap.invalid',  '{"full_name": "Berk Pgtapyonetici"}'),
  ('00000000-0000-0000-0000-000000000733', 'pgtap-mn-holder@pgtap.invalid',   '{"full_name": "Nehir Pgtapnot"}'),
  ('00000000-0000-0000-0000-000000000734', 'pgtap-mn-plain@pgtap.invalid',    '{"full_name": "Pelin Pgtapuye"}'),
  ('00000000-0000-0000-0000-000000000735', 'pgtap-mn-subject@pgtap.invalid',  '{"full_name": "Sevgi Pgtapkonu"}'),
  ('00000000-0000-0000-0000-000000000736', 'pgtap-mn-deleting@pgtap.invalid', '{"full_name": "Deniz Pgtapsiliniyor"}'),
  ('00000000-0000-0000-0000-000000000737', 'pgtap-mn-probation@pgtap.invalid', '{"full_name": "Okan Pgtapaday"}'),
  ('00000000-0000-0000-0000-000000000738', 'pgtap-mn-pending@pgtap.invalid',   '{"full_name": "Pınar Pgtapbekleyen"}'),
  ('00000000-0000-0000-0000-000000000739', 'pgtap-mn-onalim@pgtap.invalid',    '{"full_name": "Orhan Pgtaponalim"}'),
  ('00000000-0000-0000-0000-00000000073b', 'pgtap-mn-inactive-admin@pgtap.invalid', '{"full_name": "Ilker Pgtappasif"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-00000000073a', 'pgtap-mn-notes');
insert into public.role_permissions (role_id, permission) values
  ('00000000-0000-0000-0000-00000000073a', 'members.notes');

update public.profiles set status = 'active',
  role_id = (select id from public.roles where is_admin)
  where id in ('00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000732');
update public.profiles set status = 'active', role_id = '00000000-0000-0000-0000-00000000073a' where id = '00000000-0000-0000-0000-000000000733';
update public.profiles set status = 'active' where id in ('00000000-0000-0000-0000-000000000734', '00000000-0000-0000-0000-000000000735');
update public.profiles set status = 'probation', role_id = '00000000-0000-0000-0000-00000000073a' where id = '00000000-0000-0000-0000-000000000737';
update public.profiles set status = 'probation' where id = '00000000-0000-0000-0000-000000000739';
update public.profiles set status = 'inactive', role_id = (select id from public.roles where is_admin)
  where id = '00000000-0000-0000-0000-00000000073b';
update public.profiles
  set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
  where id = '00000000-0000-0000-0000-000000000736';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Planted as postgres (no auth.uid(): the author trigger leaves author null): a note about the deleting account and
-- a note by admin B about admin A.
insert into public.member_notes (profile_id, body) values
  ('00000000-0000-0000-0000-000000000736', 'Silinen hesap notu.'),
  ('00000000-0000-0000-0000-000000000731', 'Yöneticiye not.'),
  ('00000000-0000-0000-0000-000000000733', 'Notu olan yetkili.'),
  ('00000000-0000-0000-0000-00000000073b', 'Pasif yöneticiye not.');

-- Grants
select ok(not has_table_privilege('anon', 'public.member_notes', 'select'), 'anon has no select grant');
select ok(not has_table_privilege('authenticated', 'public.member_notes', 'update'), 'authenticated has no update grant');
select ok(not has_column_privilege('authenticated', 'public.member_notes', 'author_id', 'insert'),
  'author_id is not insertable');

-- ---------------------------------------------------------------------------
-- 0733 notes holder
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000733');
select lives_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', 'Buluşmaya geç kaldı.') $$,
  'holder adds a note');
select is((select author_id from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), '00000000-0000-0000-0000-000000000733'::uuid,
  'author is forced to the caller');
select throws_ok($$ insert into public.member_notes (profile_id, body, author_id)
  values ('00000000-0000-0000-0000-000000000735', 'x', '00000000-0000-0000-0000-000000000731') $$, '42501', null, 'author_id is not writable');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), 1::bigint, 'holder reads notes');
select throws_ok($$ update public.member_notes set body = 'y' where profile_id = '00000000-0000-0000-0000-000000000735' $$, '42501', null,
  'nobody updates a note (no update grant)');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000736', 'x') $$, '42501', null,
  'cannot note a deleting account');
select is_empty($$ delete from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735' returning 1 $$,
  'non-admin cannot delete');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000731', 'x') $$, '42501', null,
  'non-admin cannot note an admin');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000731'), 0::bigint,
  'non-admin cannot read notes about an admin');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000733', 'x') $$, '42501', null,
  'cannot note oneself');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', '  ') $$, '23514', null,
  'blank body refused');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', ' padded ') $$, '23514', null,
  'untrimmed body refused');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', repeat('a', 2001)) $$,
  '23514', null, 'body over 2000 characters refused');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000736'), 0::bigint,
  'notes about a deleting account are hidden');
select lives_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000738', 'Bekleyen üye notu.') $$,
  'holder adds a note about a pending member');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000738'), 1::bigint,
  'holder reads the note about a pending member');
select lives_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000739', 'Ön alım üyesi notu.') $$,
  'holder adds a note about a probation member');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000739'), 1::bigint,
  'holder reads the note about a probation member');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-00000000073b'), 0::bigint,
  'holder reads no notes about an inactive admin-role holder');
select throws_ok($$ insert into public.member_notes (profile_id, body)
  values ('00000000-0000-0000-0000-00000000073b', 'x') $$, '42501', null,
  'holder cannot note an inactive admin-role holder');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000733'), 0::bigint,
  'holder reads no notes about themselves (a note exists)');
reset role;

-- ---------------------------------------------------------------------------
-- No permission, probation with the role, the subject, anon
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000734');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), 0::bigint,
  'active member without the permission reads nothing');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', 'x') $$, '42501', null,
  'active member without the permission cannot insert');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000737');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), 0::bigint,
  'probation member holding the role reads nothing (rights are active-only)');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', 'x') $$, '42501', null,
  'probation member holding the role cannot insert');
reset role;

select pg_temp.login('00000000-0000-0000-0000-000000000735');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), 0::bigint,
  'a subject without the permission reads no notes about themselves');
reset role;

set local role anon;
select throws_ok($$ select * from public.member_notes $$, '42501', null, 'anon cannot read');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000735', 'x') $$, '42501', null,
  'anon cannot insert');
reset role;

-- ---------------------------------------------------------------------------
-- 0731 admin A
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-000000000731');
select lives_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000732', 'Admin B hakkında.') $$,
  'admin adds a note about another admin');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000732'), 1::bigint,
  'admin reads notes about another admin');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000731'), 0::bigint,
  'admin cannot read notes about themselves');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-00000000073b'), 1::bigint,
  'admin reads notes about an inactive admin-role holder');
select is_empty($$ delete from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000731' returning 1 $$,
  'admin cannot delete a note about themselves');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735'), 1::bigint,
  'admin reads notes about a member');
select throws_ok($$ insert into public.member_notes (profile_id, body) values ('00000000-0000-0000-0000-000000000736', 'x') $$, '42501', null,
  'admin cannot note a deleting account');
select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000736'), 0::bigint,
  'admin cannot read notes about a deleting account');
select is_empty($$ delete from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000736' returning 1 $$,
  'admin cannot delete notes about a deleting account');
select isnt_empty($$ delete from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000735' returning 1 $$,
  'admin deletes the note about a member');
reset role;

select is((select count(*) from public.member_notes where profile_id = '00000000-0000-0000-0000-000000000731'), 1::bigint,
  'the note about admin A survived');

select * from finish();
rollback;
