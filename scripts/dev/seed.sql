-- Local demo data for trying the app by hand (never production; not the automatic seed, which E2E runs expect empty).
-- Run:   docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 < scripts/dev/seed.sql
-- Undo:  docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 < scripts/dev/unseed.sql
-- Needs the test users from docs/learnings/testing.md (organizer@, member@, probation@test.local). Running it twice
-- refuses (unseed first). Seed members use `@fixture.invalid` emails and can't sign in; places are public spots.
begin;

do $$
declare
  v_org uuid := (select id from auth.users where email = 'organizer@test.local');
  v_member uuid := (select id from auth.users where email = 'member@test.local');
  v_probation uuid := (select id from auth.users where email = 'probation@test.local');
  v_names text[] := array[
    'Ahmet Yılmaz', 'Elif Kaya', 'Mehmet Demir', 'Zeynep Çelik', 'Can Şahin', 'Ayşe Aydın', 'Burak Öztürk',
    'Selin Arslan', 'Emre Doğan', 'Deniz Kılıç', 'Murat Aslan', 'Ece Koç', 'Kerem Kurt', 'Gizem Özdemir',
    'Onur Polat', 'İrem Erdoğan', 'Serkan Güneş', 'Pınar Yıldız', 'Tolga Aktaş', 'Cansu Bulut'];
  v_districts text[] := array['Kadıköy', 'Üsküdar', 'Ataşehir', 'Maltepe', 'Beşiktaş', 'Şişli', 'Sarıyer', 'Bakırköy'];
  v_bikes text[][] := array[
    ['Yamaha', 'MT-07', '689'], ['Honda', 'CB650R', '649'], ['BMW', 'R 1250 GS', '1254'], ['Kawasaki', 'Z900', '948'],
    ['KTM', '390 Duke', '373'], ['Honda', 'PCX', '125'], ['Triumph', 'Street Triple', '765'], ['Suzuki', 'V-Strom 650', '645'],
    ['Ducati', 'Monster', '937'], ['Yamaha', 'Tracer 9', '890']];
  v_seed uuid[] := '{}';
  v_id uuid;
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e4 uuid; v_e5 uuid; v_e6 uuid; v_ev uuid;
  i integer;
  d date := current_date;
begin
  if v_org is null or v_member is null or v_probation is null then
    raise exception 'create the test users first (docs/learnings/testing.md)';
  end if;
  if exists (select 1 from auth.users where email like 'seed-%@fixture.invalid') then
    raise exception 'seed data already present: run scripts/dev/unseed.sql first';
  end if;

  -- 20 members: 16 full, 4 ön alım; every other one has a bike, every third an emergency contact.
  for i in 1 .. array_length(v_names, 1) loop
    v_id := gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data)
    values (v_id, format('seed-%s@fixture.invalid', i), jsonb_build_object('full_name', v_names[i]));
    update public.profiles
    set status = case when i > 16 then 'probation' else 'active' end::public.member_status,
        district = v_districts[1 + (i % array_length(v_districts, 1))],
        side = case when (1 + (i % array_length(v_districts, 1))) <= 4 then 'asian' else 'european' end::public.istanbul_side
    where id = v_id;
    if i % 2 = 1 or i <= 8 then
      insert into public.member_motorcycles (profile_id, brand, model, cc)
      values (v_id, v_bikes[1 + (i % 10)][1], v_bikes[1 + (i % 10)][2], v_bikes[1 + (i % 10)][3]::smallint);
    end if;
    if i % 3 = 0 then
      insert into public.member_emergency_contacts (profile_id, position, name, relationship, phone)
      values (v_id, 1, 'Yakını ' || i, 'parent', format('+90555%s', lpad(i::text, 7, '0')));
    end if;
    v_seed := v_seed || v_id;
  end loop;

  -- 1. Meet-up at a venue-only place (Google place link, no pin), the day after tomorrow 20:00, no limits.
  insert into public.events (kind, title, side, starts_at, description, created_by, updated_by)
  values ('meetup', 'Moda akşam buluşması', 'asian', ((d + 2) + time '20:00') at time zone 'Europe/Istanbul',
          'Haftalık akşam buluşması. Motoru sahil tarafına park edebilirsin.', v_org, v_org)
  returning id into v_e1;
  insert into public.event_places (event_id, position, name, venue_url, venue_label) values (v_e1, 0,
    'Starbucks Caferağa',
    'https://www.google.com/maps/place/Starbucks,+Cafera%C4%9Fa,+Muvakk%C4%B1thane+Cd.+No:9,+34710+Kad%C4%B1k%C3%B6y%2F%C4%B0stanbul/data=!4m2!3m1!1s0x14cab93c1a414691:0x31f407649c1b19e0',
    'Starbucks, Caferağa, Muvakkıthane Cd. No:9, 34710 Kadıköy/İstanbul');

  -- 2. Ride with limits almost reached (11 / 12 people, 7 / 8 bikes) and one logged time change.
  insert into public.events (kind, title, side, area, starts_at, ends_at, description, limit_people, limit_bikes,
                             created_by, updated_by)
  values ('ride', 'Ağva kahvaltı sürüşü', 'asian', 'Üsküdar → Ağva',
          ((d + 4) + time '08:30') at time zone 'Europe/Istanbul', ((d + 4) + time '15:00') at time zone 'Europe/Istanbul',
          'Şile''de kısa mola, Ağva''da kahvaltı. Sakin tempo.', 12, 8, v_org, v_org)
  returning id into v_e2;
  insert into public.event_places (event_id, position, name, lat, lng) values
    (v_e2, 0, 'Kız Kulesi önü', 41.021111, 29.004167),
    (v_e2, 1, 'Şile merkez', 41.176600, 29.612600),
    (v_e2, 2, 'Ağva', 41.137000, 29.853000);
  insert into public.event_changes (event_id, changed_by, changed_at, changes) values (v_e2, v_org, now() - interval '3 hours',
    jsonb_build_array(jsonb_build_object('field', 'starts_at',
      'old', to_jsonb(((d + 4) + time '08:00') at time zone 'Europe/Istanbul'),
      'new', to_jsonb(((d + 4) + time '08:30') at time zone 'Europe/Istanbul'))));

  -- 3. Ride for big bikes and full members only (600 cc).
  insert into public.events (kind, title, side, area, starts_at, min_cc, full_members_only, created_by, updated_by)
  values ('ride', 'Kilyos sahil turu', 'european', 'Beşiktaş → Kilyos',
          ((d + 6) + time '09:00') at time zone 'Europe/Istanbul', 600, true, v_org, v_org)
  returning id into v_e3;
  insert into public.event_places (event_id, position, name, lat, lng) values
    (v_e3, 0, 'Bebek sahil', 41.077000, 29.043400),
    (v_e3, 1, 'Sarıyer iskele', 41.166700, 29.050000),
    (v_e3, 2, 'Kilyos plajı', 41.245300, 29.022800);

  -- 4. Meet-up whose people limit was lowered below the sign-ups (7 / 5: "Sınır aşıldı" for organisers).
  insert into public.events (kind, title, side, starts_at, limit_people, created_by, updated_by)
  values ('meetup', 'Belgrad Ormanı piknik', 'european', ((d + 9) + time '11:00') at time zone 'Europe/Istanbul', 5,
          v_org, v_org)
  returning id into v_e4;
  insert into public.event_places (event_id, position, name, lat, lng)
  values (v_e4, 0, 'Neşet Suyu girişi', 41.181000, 28.989000);

  -- 5. Cancelled ride with two sign-ups.
  insert into public.events (kind, title, area, starts_at, status, cancelled_at, cancel_reason, created_by, updated_by)
  values ('ride', 'Polonezköy turu', 'Kadıköy → Polonezköy', ((d + 12) + time '10:00') at time zone 'Europe/Istanbul',
          'cancelled', now() - interval '1 day', 'Yağmur bekleniyor, başka bir hafta sonuna alacağız.', v_org, v_org)
  returning id into v_e5;
  insert into public.event_places (event_id, position, name, lat, lng) values
    (v_e5, 0, 'Kadıköy iskele', 40.990500, 29.023400),
    (v_e5, 1, 'Polonezköy', 41.120000, 29.210000);

  -- 6. Two-day ride without sign-ups (can still be deleted).
  insert into public.events (kind, title, side, area, starts_at, ends_at, created_by, updated_by)
  values ('ride', 'Şile hafta sonu kampı', 'asian', 'Üsküdar → Şile',
          ((d + 16) + time '08:00') at time zone 'Europe/Istanbul', ((d + 17) + time '18:00') at time zone 'Europe/Istanbul',
          v_org, v_org)
  returning id into v_e6;
  insert into public.event_places (event_id, position, name, lat, lng) values
    (v_e6, 0, 'Kız Kulesi önü', 41.021111, 29.004167),
    (v_e6, 1, 'Şile feneri', 41.178000, 29.611000);

  -- Sign-ups (written directly, so event 4 can be over its limit).
  insert into public.event_signups (event_id, profile_id, role, guests)
  select v_e1, s.id, case when s.n % 3 = 0 then 'passenger' else 'rider' end::public.event_role, (s.n % 4 = 0)::int
  from unnest(v_seed[1:8]) with ordinality as s(id, n);
  insert into public.event_signups (event_id, profile_id, role, guests) values
    (v_e1, v_member, 'rider', 0), (v_e1, v_probation, 'passenger', 0);
  -- event 2: 7 riders (one with a guest) + 3 passengers = 11 people, 7 bikes
  insert into public.event_signups (event_id, profile_id, role, guests)
  select v_e2, s.id, case when s.n <= 7 then 'rider' else 'passenger' end::public.event_role, (s.n = 1)::int
  from unnest(v_seed[1:10]) with ordinality as s(id, n);
  -- event 3: riders with 600+ cc bikes (seed members 1-4: 649, 1254, 948, 765 cc)
  insert into public.event_signups (event_id, profile_id, role)
  select v_e3, s.id, 'rider' from unnest(array[v_seed[1], v_seed[2], v_seed[3], v_seed[6]]) as s(id);
  -- event 4: seed members 9-15 (the odd ones own a bike)
  insert into public.event_signups (event_id, profile_id, role)
  select v_e4, s.id, case when s.n % 2 = 1 then 'rider' else 'passenger' end::public.event_role
  from unnest(v_seed[9:15]) with ordinality as s(id, n);
  insert into public.event_signups (event_id, profile_id, role) values (v_e5, v_seed[16], 'rider'), (v_e5, v_seed[17], 'passenger');

  -- 30 past events, one a week back from last week (more than one page of 25), a few sign-ups each.
  for i in 1 .. 30 loop
    if i % 2 = 0 then
      insert into public.events (kind, title, side, starts_at, created_by, updated_by)
      values ('meetup', format('Akşam buluşması (%s hafta önce)', i), 'asian',
              ((d - 7 * i) + time '20:00') at time zone 'Europe/Istanbul', v_org, v_org)
      returning id into v_ev;
      insert into public.event_places (event_id, position, name, lat, lng) values (v_ev, 0, 'Moda Sahili', 40.980600, 29.025400);
    else
      insert into public.events (kind, title, side, area, starts_at, created_by, updated_by)
      values ('ride', format('Pazar sürüşü (%s hafta önce)', i), 'european', 'Beşiktaş → Kilyos',
              ((d - 7 * i) + time '09:00') at time zone 'Europe/Istanbul', v_org, v_org)
      returning id into v_ev;
      insert into public.event_places (event_id, position, name, lat, lng) values
        (v_ev, 0, 'Bebek sahil', 41.077000, 29.043400), (v_ev, 1, 'Kilyos plajı', 41.245300, 29.022800);
    end if;
    insert into public.event_signups (event_id, profile_id, role)
    select v_ev, s.id, 'rider' from unnest(v_seed[1 + (i % 5) : 4 + (i % 5)]) as s(id);
  end loop;
end;
$$;

select 'members' as seeded, count(*) from auth.users where email like 'seed-%@fixture.invalid'
union all select 'events', count(*) from public.events
  where created_by = (select id from auth.users where email = 'organizer@test.local')
union all select 'sign-ups', count(*) from public.event_signups;

commit;
