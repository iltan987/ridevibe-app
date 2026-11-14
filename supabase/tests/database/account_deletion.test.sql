-- Run with: pnpm db:test
-- Self-service account deletion: status, columns and constraints. Later tasks append their assertions here.
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

-- Fixtures (postgres bypasses RLS). Ids 0000…07a1–07a9; every query is scoped to them.
-- 07a7 active (constraint checks).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000007a7', 'pgtap-del-constraint@pgtap.invalid', '{"full_name": "Cem Constraint"}');
update public.profiles set status = 'active' where id = '00000000-0000-0000-0000-0000000007a7';

-- Task 1: deleting status and columns
select has_column('public', 'profiles', 'deletion_requested_at', 'profiles.deletion_requested_at exists');
select has_column('public', 'profiles', 'status_before_deletion', 'profiles.status_before_deletion exists');
select has_column('public', 'applications', 'retained_until', 'applications.retained_until exists');
select enum_has_labels('public', 'member_status', array['pending', 'active', 'inactive', 'deleting'],
  'member_status has the deleting label');

select throws_ok(
  $$ update public.profiles set status = 'deleting' where id = '00000000-0000-0000-0000-0000000007a7' $$,
  '23514', null, 'deleting without the two columns violates profiles_deletion_state');
select lives_ok(
  $$ update public.profiles set status = 'deleting', deletion_requested_at = now(), status_before_deletion = 'active'
     where id = '00000000-0000-0000-0000-0000000007a7' $$,
  'deleting with both columns set is allowed');
select throws_ok(
  $$ update public.profiles set status_before_deletion = 'deleting' where id = '00000000-0000-0000-0000-0000000007a7' $$,
  '23514', null, 'status_before_deletion can never be deleting');

select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'deletion_requested_at', 'update')
  and not has_column_privilege('authenticated', 'public.profiles', 'status_before_deletion', 'update')
  and not has_column_privilege('authenticated', 'public.applications', 'retained_until', 'update'),
  'authenticated has no update grant on the deletion columns');

select * from finish();
rollback;
