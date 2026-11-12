SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.member_directory_counts (
  search       text              DEFAULT NULL::text,
  blood_filter public.blood_type DEFAULT NULL::public.blood_type,
  no_contact   boolean           DEFAULT false
)
  RETURNS TABLE (
    total    bigint,
    asian    bigint,
    european bigint
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pattern text;
  no_contact_only boolean := coalesce(no_contact, false);
begin
  if not private.is_active_member() then
    raise exception 'active members only' using errcode = '42501';
  end if;

  if (blood_filter is not null or no_contact_only) and not private.has_permission('members.safety') then
    raise exception 'members.safety required' using errcode = '42501';
  end if;

  if blood_filter is not null then
    perform private.log_safety_access('filter_blood_type', null, blood_filter::text);
  end if;

  if nullif(btrim(left(search, 60)), '') is not null then
    pattern := '%' || replace(replace(replace(
      private.search_fold(btrim(left(search, 60))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    count(*),
    count(*) filter (where p.side = 'asian'),
    count(*) filter (where p.side = 'european')
  from public.profiles p
  where p.status = 'active'
    and (pattern is null or private.search_fold(p.full_name) like pattern)
    and (
      blood_filter is null
      or exists (select 1 from public.member_health h
                 where h.profile_id = p.id and h.blood_type = blood_filter)
    )
    and (
      not no_contact_only
      or not exists (select 1 from public.member_emergency_contacts c where c.profile_id = p.id)
    );
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
  if not private.is_active_member() then
    raise exception 'only active members can set a blood type' using errcode = '42501';
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
