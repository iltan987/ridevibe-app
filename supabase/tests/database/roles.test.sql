-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

-- Fixtures: an admin and an active member with a fixture role that holds
-- every non-admin permission (to prove those still don't allow role editing).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000001a1', 'pgtap-roles-admin@pgtap.invalid',  '{"full_name": "Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000001c1', 'pgtap-roles-member@pgtap.invalid', '{"full_name": "Mert Member"}');
insert into public.roles (id, name) values ('00000000-0000-0000-0000-0000000001f1', 'pgtap-everything');
insert into public.role_permissions (role_id, permission)
  select '00000000-0000-0000-0000-0000000001f1', unnest(enum_range(null::public.permission));
update public.profiles set role_id = (select id from public.roles where is_admin), status = 'active'
  where id = '00000000-0000-0000-0000-0000000001a1';
update public.profiles set role_id = '00000000-0000-0000-0000-0000000001f1', status = 'active'
  where id = '00000000-0000-0000-0000-0000000001c1';

create function pg_temp.login(uid uuid) returns void language sql as $$
  select set_config('role', 'authenticated', true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

select is((select count(*)::int from public.roles where is_admin), 1, 'exactly one built-in admin role exists');

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select id from public.roles', '42501', null, 'anon cannot read roles');
select throws_ok('select role_id from public.role_permissions', '42501', null, 'anon cannot read role permissions');
reset role;

-- ---------------------------------------------------------------------------
-- Member holding every permission, but not admin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000001c1');

select ok((select count(*) > 0 from public.roles), 'signed-in users can read roles');

select throws_ok(
  $$ insert into public.roles (name) values ('pgtap-sneaky') $$,
  '42501', null,
  'non-admins cannot create roles'
);

delete from public.role_permissions where role_id = '00000000-0000-0000-0000-0000000001f1';
update public.roles set name = 'pgtap-renamed' where id = '00000000-0000-0000-0000-0000000001f1';
reset role;

select is(
  (select name || '|' || (select count(*) from public.role_permissions where role_id = r.id)::text
   from public.roles r where r.id = '00000000-0000-0000-0000-0000000001f1'),
  'pgtap-everything|6',
  'non-admins cannot rename roles or revoke permissions (even with every permission)'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select pg_temp.login('00000000-0000-0000-0000-0000000001a1');

select lives_ok(
  $$ insert into public.roles (name) values ('pgtap-captain') $$,
  'admin can create a role'
);

select throws_ok(
  $$ insert into public.roles (name) values ('  PGTAP-Captain ') $$,
  '23505', null,
  'role names are unique (case/space-insensitive)'
);

select throws_ok(
  $$ insert into public.roles (name, is_admin) values ('pgtap-second-admin', true) $$,
  '42501', null,
  'nobody can create another admin role'
);

select lives_ok(
  $$ insert into public.role_permissions (role_id, permission)
     values ((select id from public.roles where name = 'pgtap-captain'), 'applications.view') $$,
  'admin can grant a permission to a custom role'
);

select lives_ok(
  $$ update public.roles set name = 'pgtap-ride-captain' where name = 'pgtap-captain' $$,
  'admin can rename a custom role'
);

select throws_ok(
  $$ insert into public.role_permissions (role_id, permission)
     values ((select id from public.roles where is_admin), 'applications.view') $$,
  '42501', null,
  'permissions cannot be attached to the built-in admin role'
);

update public.roles set name = 'pgtap-hacked' where is_admin;
delete from public.roles where is_admin;
reset role;

select is((select count(*)::int from public.roles where is_admin and name <> 'pgtap-hacked'), 1,
  'the built-in admin role cannot be renamed or deleted');

select pg_temp.login('00000000-0000-0000-0000-0000000001a1');
delete from public.roles where id = '00000000-0000-0000-0000-0000000001f1';
reset role;

select is(
  (select coalesce(role_id::text, 'none') from public.profiles where id = '00000000-0000-0000-0000-0000000001c1'),
  'none',
  'deleting a role turns its holders into regular members'
);

select is(
  (select count(*)::int from public.role_permissions where role_id = '00000000-0000-0000-0000-0000000001f1'),
  0,
  'deleting a role removes its permissions'
);

select is(
  (select string_agg(r.name || ':' || rp.permission, ',') from public.roles r
   join public.role_permissions rp on rp.role_id = r.id where r.name like 'pgtap-%captain'),
  'pgtap-ride-captain:applications.view',
  'admin-created role, permission and rename are persisted'
);

select * from finish();
rollback;
