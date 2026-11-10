-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(26);

-- ---------------------------------------------------------------------------
-- private.tidy_name: pure function checks
-- ---------------------------------------------------------------------------
select is(private.tidy_name('kerim çelik', true), 'Kerim Çelik', 'lowercase Turkish name is capitalised');
select is(private.tidy_name('AYŞE NUR YILMAZ', true), 'Ayşe Nur Yılmaz', 'ALL CAPS is lowered with Turkish rules');
select is(private.tidy_name('ilker  ışık', true), 'İlker Işık', 'i -> İ and ı -> I at word start (Turkish)');
select is(private.tidy_name('  ilker   ışık ', true), 'İlker Işık', 'whitespace is trimmed and collapsed');
select is(private.tidy_name('ian smith', false), 'Ian Smith', 'non-Turkish casing keeps i -> I');
select is(private.tidy_name('ÇELİK', true), 'Çelik', 'ÇELİK -> Çelik');
select is(private.tidy_name('KERİM', true), 'Kerim', 'KERİM -> Kerim');
select is(private.tidy_name('CELIK', true), 'Celık', 'documented misfire: dotless I lowers to ı in Turkish');
select is(private.tidy_name('ayşe-nur', true), 'Ayşe-Nur', 'hyphen parts are capitalised');
select is(private.tidy_name('ludwig van beethoven', false), 'Ludwig van Beethoven', 'particles stay lowercase');
select is(private.tidy_name('van halen', false), 'Van Halen', 'a particle as first word is capitalised');
select is(private.tidy_name('Ludwig Van Beethoven', false), 'Ludwig Van Beethoven', 'mixed case is left alone');
select is(private.tidy_name('McLaren', false), 'McLaren', 'McLaren is left alone');
select is(private.tidy_name('DeLuca', true), 'DeLuca', 'DeLuca is left alone');
select is(private.tidy_name('O', true), 'O', 'a single capital letter is left alone');
select is(private.tidy_name('a', true), 'A', 'a single lowercase letter is capitalised');
select is(private.tidy_name('', true), '', 'empty stays empty');

select ok(private.uses_turkish_casing('ilker', 'tr'), 'tr locale uses Turkish casing');
select ok(not private.uses_turkish_casing('ilker', 'en'), 'en locale without Turkish letters does not');
select ok(private.uses_turkish_casing('ışık', 'en'), 'Turkish letters force Turkish casing even for en');

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000101', 'pgtap-tidy-admin@pgtap.invalid', '{"full_name": "Ada Admin"}');
update public.profiles set role_id = (select id from public.roles where is_admin), status = 'active'
  where id = '00000000-0000-0000-0000-000000000101';

set local role anon;
insert into public.applications (locale, full_name, phone, email, birth_date, city, district, side, languages,
  license_class, riding_years, owns_motorcycle, motorcycle_brand, motorcycle_model, motorcycle_cc,
  riding_styles, group_experience, in_other_clubs, heard_from, event_interests,
  expectations, alienating_behaviors, conflict_handling, consent_privacy, consent_rules, consent_photos,
  privacy_notice_version)
select l, n, p, e, '1995-05-17', 'İstanbul', 'Kadıköy', 'asian', array['tr'],
  'a2', 3, true, 'Honda', 'CB650R', 650,
  array['city'], 'some', false, 'instagram_ad', array['day_rides'],
  'Güvenli grup sürüşleri.', 'Kural tanımayan.', 'Önce sakinleşirim.', true, true, false, 'test'
from (values ('en', 'ian smith', '+905321230101', 'tidy-en@pgtap.invalid'),
             ('tr', 'ian smith', '+905321230102', 'tidy-tr@pgtap.invalid')) as v(l, n, p, e);
reset role;

select is(
  (select full_name from public.applications where email = 'tidy-en@pgtap.invalid'),
  'Ian Smith', 'application insert tidies the name (en locale)');
select is(
  (select full_name from public.applications where email = 'tidy-tr@pgtap.invalid'),
  'İan Smith', 'application insert tidies the name (tr locale)');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', '00000000-0000-0000-0000-000000000101', 'role', 'authenticated')::text, true);
update public.applications set full_name = 'XYZ lojistik' where email = 'tidy-en@pgtap.invalid';
reset role;
-- Staff corrections are stored as typed: an ALL-CAPS word ("XYZ") must survive.
select is(
  (select full_name from public.applications where email = 'tidy-en@pgtap.invalid'),
  'XYZ lojistik', 'staff application name update is stored as typed');

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000102', 'pgtap-tidy-zeynep@pgtap.invalid', '{"full_name": "ZEYNEP KAYA"}');
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000102'),
  'Zeynep Kaya', 'sign-up creates a tidied profile name');

select set_config('role', 'authenticated', true),
       set_config('request.jwt.claims',
         json_build_object('sub', '00000000-0000-0000-0000-000000000101', 'role', 'authenticated')::text, true);
select lives_ok(
  $$ select public.set_member_name('00000000-0000-0000-0000-000000000102', '  XYZ lojistik ') $$,
  'staff can rename a member');
reset role;
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-000000000102'),
  'XYZ lojistik', 'set_member_name stores the name as typed (trimmed only)');

select * from finish();
rollback;
