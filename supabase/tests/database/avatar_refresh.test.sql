-- Run with: pnpm db:test
-- Google sign-in refreshes the profile photo: Supabase Auth rewrites the Google identity's identity_data with the
-- provider's current data on every sign-in, and a trigger copies a changed avatar_url to profiles. The source is
-- auth.identities, never raw_user_meta_data: users can rewrite their own user metadata through the Auth API
-- (updateUser), so it would let anyone show any URL as their photo. Names are never refreshed (staff corrections stay).
begin;
create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'pgtap-avatar@pgtap.invalid',
   '{"full_name": "Ada Avatar", "avatar_url": "https://lh3.googleusercontent.com/a/old"}');
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  ('pgtap-google-9a1', '00000000-0000-0000-0000-0000000009a1',
   '{"sub": "pgtap-google-9a1", "full_name": "Ada Avatar", "avatar_url": "https://lh3.googleusercontent.com/a/old"}',
   'google', now(), now(), now()),
  -- Another provider's identity of the same user: never a photo source.
  ('pgtap-other-9a1', '00000000-0000-0000-0000-0000000009a1', '{"sub": "pgtap-other-9a1"}', 'email', now(), now(), now());

create function pg_temp.avatar() returns text language sql as $$
  select avatar_url from public.profiles where id = '00000000-0000-0000-0000-0000000009a1';
$$;
-- Every row update gets a new ctid (now() and updated_at don't change inside one transaction).
create function pg_temp.row_version() returns tid language sql as $$
  select ctid from public.profiles where id = '00000000-0000-0000-0000-0000000009a1';
$$;
-- What Supabase Auth does on a Google sign-in of an existing account (external.go, AccountExists).
create function pg_temp.google_sign_in(data jsonb) returns void language sql as $$
  update auth.identities set identity_data = identity_data || data, last_sign_in_at = now()
  where provider_id = 'pgtap-google-9a1' and provider = 'google';
$$;

select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/old', 'sign-up copies the Google photo');

select pg_temp.google_sign_in('{"avatar_url": "https://lh3.googleusercontent.com/a/new"}');
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/new', 'a Google sign-in with a new photo updates the profile');

create temp table v as select pg_temp.row_version() as version;
select pg_temp.google_sign_in('{"avatar_url": "https://lh3.googleusercontent.com/a/new"}');
select is(pg_temp.row_version(), (select version from v), 'the same photo again: profile not written');

update auth.identities set last_sign_in_at = now() where provider_id = 'pgtap-google-9a1';
select is(pg_temp.row_version(), (select version from v), 'an unrelated identities update: profile not written');

-- Must fail: user metadata is editable by the user (Auth API updateUser), so it never reaches the profile.
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url": "https://tracker.invalid/pixel.gif"}'
  where id = '00000000-0000-0000-0000-0000000009a1';
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/new', 'a user-metadata photo is ignored');

update auth.identities set identity_data = identity_data || '{"avatar_url": "https://tracker.invalid/pixel.gif"}'
  where provider_id = 'pgtap-other-9a1';
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/new', 'a non-Google identity photo is ignored');

update public.profiles set full_name = 'Ada Düzeltilmiş' where id = '00000000-0000-0000-0000-0000000009a1';
select pg_temp.google_sign_in('{"full_name": "ada avatar google", "name": "ada avatar google", "avatar_url": "https://lh3.googleusercontent.com/a/newer"}');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000009a1'), 'Ada Düzeltilmiş',
  'the name is never refreshed from Google');
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/newer', '…while the photo is');

update auth.identities set identity_data = identity_data - 'avatar_url' where provider_id = 'pgtap-google-9a1';
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/newer', 'no photo in the identity data: the old one stays');

select pg_temp.google_sign_in(jsonb_build_object('avatar_url', 'https://x.invalid/' || repeat('a', 2100)));
select is(pg_temp.avatar(), 'https://lh3.googleusercontent.com/a/newer', 'an over-long photo URL is ignored');

select ok(
  not (has_function_privilege('anon', 'private.handle_google_avatar_change()', 'execute')
       or has_function_privilege('authenticated', 'private.handle_google_avatar_change()', 'execute')),
  'the trigger function is not callable by anon/authenticated');

select * from finish();
rollback;
