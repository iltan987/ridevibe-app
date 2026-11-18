SET local check_function_bodies = off;

DROP POLICY "member_emergency_contacts: insert own while active" ON "public"."member_emergency_contacts";

DROP POLICY "member_emergency_contacts: update own while active" ON "public"."member_emergency_contacts";

DROP POLICY "member_motorcycles: delete own while active" ON "public"."member_motorcycles";

DROP POLICY "member_motorcycles: insert own while active" ON "public"."member_motorcycles";

DROP POLICY "member_motorcycles: update own while active" ON "public"."member_motorcycles";

DROP FUNCTION "public"."member_directory"(public.blood_type, boolean);

CREATE OR REPLACE FUNCTION private.is_club_member()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.status in ('active', 'probation')
  );
$function$;

CREATE OR REPLACE FUNCTION public.club_overview()
  RETURNS TABLE (
    total    integer,
    asian    integer,
    european integer,
    initials text[]
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.status = 'probation'
  ) then
    raise exception 'probation members only' using errcode = '42501';
  end if;

  return query
  with members as (
    select p.side, array_remove(regexp_split_to_array(p.full_name, '\s+'), '') as words
    from public.profiles p
    where p.status = 'active'
  )
  select
    count(*)::integer,
    (count(*) filter (where m.side = 'asian'))::integer,
    (count(*) filter (where m.side = 'european'))::integer,
    coalesce(
      array_agg(
        upper(left(m.words[1], 1) collate "tr-x-icu")
          || case when cardinality(m.words) > 1
               then upper(left(m.words[cardinality(m.words)], 1) collate "tr-x-icu") else '' end
        order by random()
      ) filter (where cardinality(m.words) > 0),
      '{}'
    )
  from members m;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."club_overview"() FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.link_application (
  application_id uuid,
  target_id      uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  app_status public.application_status;
  target_status public.member_status;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  select a.status into app_status
  from public.applications a
  where a.id = application_id and a.profile_id is null and a.status <> 'rejected'
    and a.retained_until is null
    and not private.application_hidden_for_deletion(a.profile_id, a.email, a.status)
  for update;
  if not found then
    raise exception 'application % not found or not linkable', application_id using errcode = 'P0002';
  end if;

  select p.status into target_status
  from public.profiles p
  where p.id = target_id
    and (p.status = 'pending' or (p.status in ('active', 'probation') and app_status = 'approved'))
  for update;
  if not found
    or exists (
      select 1 from public.applications a
      where a.profile_id = target_id and a.status in ('new', 'contacted', 'approved')
        and a.retained_until is null
    )
    or exists (
      select 1
      from public.applications a
      join public.member_contacts c on c.profile_id = target_id
      where a.id <> application_id
        and a.profile_id is null
        and a.retained_until is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
  then
    raise exception 'account % not found or not linkable', target_id using errcode = 'P0002';
  end if;

  update public.applications a set profile_id = target_id where a.id = application_id;

  if app_status = 'approved' and target_status = 'pending' then
    perform private.activate_from_approved_application(target_id);
  elsif app_status = 'approved' then
    perform private.fill_member_from_application(target_id, application_id);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.linkable_accounts (
  search         text                     DEFAULT NULL::text,
  after_created  timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  after_id       uuid                     DEFAULT NULL::uuid,
  include_active boolean                  DEFAULT false
)
  RETURNS TABLE (
    id         uuid,
    full_name  text,
    avatar_url text,
    email      text,
    created_at timestamp with time zone,
    status     public.member_status
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pattern text;
begin
  if not private.has_permission('applications.decide') then
    raise exception 'missing permission applications.decide' using errcode = '42501';
  end if;

  if (after_created is null) <> (after_id is null) then
    raise exception 'after_created and after_id go together' using errcode = '22023';
  end if;

  if nullif(btrim(search), '') is not null then
    pattern := '%' || replace(replace(replace(btrim(search), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select p.id, p.full_name, p.avatar_url, c.email, p.created_at, p.status
  from public.profiles p
  left join public.member_contacts c on c.profile_id = p.id
  where (p.status = 'pending' or (include_active and p.status in ('active', 'probation')))
    and not exists (
      select 1 from public.applications a
      where a.profile_id = p.id and a.status in ('new', 'contacted', 'approved')
        and a.retained_until is null
    )
    and not exists (
      select 1 from public.applications a
      where a.profile_id is null
        and a.retained_until is null
        and a.status in ('new', 'contacted', 'approved')
        and private.normalize_email(a.email) = private.normalize_email(c.email)
    )
    and (pattern is null or p.full_name ilike pattern or c.email ilike pattern)
    and (after_created is null or (p.created_at, p.id) < (after_created, after_id))
  order by p.created_at desc, p.id desc
  limit 26;
end;
$function$;

CREATE OR REPLACE FUNCTION public.member_directory (
  blood_filter public.blood_type DEFAULT NULL::public.blood_type,
  no_contact   boolean           DEFAULT false
)
  RETURNS TABLE (
    id                    uuid,
    full_name             text,
    avatar_url            text,
    district              text,
    side                  public.istanbul_side,
    birth_month           smallint,
    birth_day             smallint,
    instagram             text,
    motorcycles           jsonb,
    has_emergency_contact boolean,
    probation             boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  safety boolean;
  sees_probation boolean;
  no_contact_only boolean := coalesce(no_contact, false);
begin
  if not private.is_active_member() then
    raise exception 'active members only' using errcode = '42501';
  end if;

  safety := private.has_permission('members.safety');
  sees_probation := safety or private.has_permission('members.manage');
  if (blood_filter is not null or no_contact_only) and not safety then
    raise exception 'members.safety required' using errcode = '42501';
  end if;

  if blood_filter is not null then
    perform private.log_safety_access('filter_blood_type', null, blood_filter::text);
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.district,
    p.side,
    case when d.show_birthday and d.birth_date is not null
      then extract(month from d.birth_date)::smallint end,
    case when d.show_birthday and d.birth_date is not null
      then extract(day from d.birth_date)::smallint end,
    case when d.show_instagram then d.instagram end,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'brand', m.brand, 'model', m.model, 'cc', m.cc,
          -- every profile gets a member_details row at sign-up: the coalesce only mirrors the column default
          'plate', case when coalesce(d.show_plates, true) then m.plate end
        ) order by m.created_at, m.id)
      from public.member_motorcycles m
      where m.profile_id = p.id
    ), '[]'::jsonb),
    case when safety then exists (
      select 1 from public.member_emergency_contacts c where c.profile_id = p.id
    ) end,
    p.status = 'probation'
  from public.profiles p
  left join public.member_details d on d.profile_id = p.id
  where (p.status = 'active' or (sees_probation and p.status = 'probation'))
    and (
      blood_filter is null
      or exists (select 1 from public.member_health h
                 where h.profile_id = p.id and h.blood_type = blood_filter)
    )
    and (
      not no_contact_only
      or not exists (select 1 from public.member_emergency_contacts c where c.profile_id = p.id)
    )
  order by p.full_name collate "tr-x-icu", p.id;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."member_directory"(public.blood_type, boolean) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.member_safety_card (
  target uuid
)
  RETURNS TABLE (
    full_name   text,
    contacts    jsonb,
    blood_type  public.blood_type,
    motorcycles jsonb
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.has_permission('members.safety') then
    raise exception 'members.safety required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = target and p.status in ('active', 'probation')) then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  perform private.log_safety_access('view_card', target);

  return query
  select
    p.full_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', c.position, 'name', c.name, 'relationship', c.relationship, 'phone', c.phone
      ) order by c.position)
      from public.member_emergency_contacts c
      where c.profile_id = p.id
    ), '[]'::jsonb),
    (select h.blood_type from public.member_health h where h.profile_id = p.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'brand', m.brand, 'model', m.model, 'cc', m.cc, 'plate', m.plate
      ) order by m.created_at, m.id)
      from public.member_motorcycles m
      where m.profile_id = p.id
    ), '[]'::jsonb)
  from public.profiles p
  where p.id = target;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_birth_date (
  new_date date
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_club_member() then
    raise exception 'only club members can set a birth date' using errcode = '42501';
  end if;

  perform 1 from public.member_details d
  where d.profile_id = (select auth.uid()) and d.birth_date is null
  for update;
  if not found then
    raise exception 'birth date is already set' using errcode = '42501';
  end if;

  if new_date is null
     or new_date <= date '1920-01-01'
     or new_date > ((now() at time zone 'Europe/Istanbul')::date - interval '18 years') then
    raise exception 'birth date must be after 1920-01-01 and at least 18 years ago'
      using errcode = '23514';
  end if;

  update public.member_details set birth_date = new_date where profile_id = (select auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_blood_type (
  new_type       public.blood_type,
  notice_version text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  uid uuid := (select auth.uid());
begin
  if not private.is_club_member() then
    raise exception 'only club members can set a blood type' using errcode = '42501';
  end if;
  if new_type is null then
    raise exception 'blood type is required' using errcode = '23514';
  end if;
  if notice_version is null or btrim(notice_version) = '' or char_length(notice_version) > 40 then
    raise exception 'notice version is required (1-40 characters)' using errcode = '23514';
  end if;

  -- Locks an existing row; on a first call there is nothing to lock, and the `on conflict do update`
  -- below is what keeps concurrent first calls safe.
  perform 1 from public.member_health h where h.profile_id = uid for update;

  insert into public.member_health (profile_id, blood_type, consent_blood_type, consent_blood_type_at, consent_blood_type_version)
  values (uid, new_type, true, now(), notice_version)
  on conflict (profile_id) do update
    set blood_type = excluded.blood_type,
        consent_blood_type = true,
        -- Keep the stamp of the first consent when the member only changes the type (they did not see the text again).
        consent_blood_type_at = case when public.member_health.consent_blood_type
          then public.member_health.consent_blood_type_at else excluded.consent_blood_type_at end,
        consent_blood_type_version = case when public.member_health.consent_blood_type
          then public.member_health.consent_blood_type_version else excluded.consent_blood_type_version end;

  perform private.log_safety_access('set_blood_type', uid);
end;
$function$;

CREATE POLICY "member_emergency_contacts: insert own while active or probation" ON "public"."member_emergency_contacts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)));

CREATE POLICY "member_emergency_contacts: update own while active or probation" ON "public"."member_emergency_contacts"
  FOR UPDATE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)))
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)));

CREATE POLICY "member_motorcycles: delete own while active or probation" ON "public"."member_motorcycles"
  FOR DELETE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)));

CREATE POLICY "member_motorcycles: insert own while active or probation" ON "public"."member_motorcycles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)));

CREATE POLICY "member_motorcycles: update own while active or probation" ON "public"."member_motorcycles"
  FOR UPDATE
  TO "authenticated"
  USING (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)))
  WITH CHECK (((profile_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_club_member() AS is_club_member)));

REVOKE ALL ON FUNCTION "private"."is_club_member"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."is_club_member"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."club_overview"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."club_overview"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."club_overview"() TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."club_overview"() TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory"(public.blood_type, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "service_role";
