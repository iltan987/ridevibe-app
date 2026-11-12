SET local check_function_bodies = off;

DROP FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer);

DROP FUNCTION "public"."member_directory_counts"(text);

CREATE OR REPLACE FUNCTION public.member_directory (
  search       text                 DEFAULT NULL::text,
  side_filter  public.istanbul_side DEFAULT NULL::public.istanbul_side,
  after_name   text                 DEFAULT NULL::text,
  after_id     uuid                 DEFAULT NULL::uuid,
  page_size    integer              DEFAULT 25,
  blood_filter public.blood_type    DEFAULT NULL::public.blood_type,
  no_contact   boolean              DEFAULT false
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
    has_emergency_contact boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pattern text;
  lim int := least(greatest(coalesce(page_size, 25), 1), 100);
  safety boolean;
  no_contact_only boolean := coalesce(no_contact, false);
begin
  if not private.is_active_member() then
    raise exception 'active members only' using errcode = '42501';
  end if;

  safety := private.has_permission('members.safety');
  if (blood_filter is not null or no_contact_only) and not safety then
    raise exception 'members.safety required' using errcode = '42501';
  end if;

  if (after_name is null) <> (after_id is null) then
    raise exception 'after_name and after_id go together' using errcode = '22023';
  end if;

  if nullif(btrim(left(search, 60)), '') is not null then
    pattern := '%' || replace(replace(replace(
      private.search_fold(btrim(left(search, 60))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
          'plate', case when coalesce(d.show_plates, true) then m.plate end
        ) order by m.created_at, m.id)
      from public.member_motorcycles m
      where m.profile_id = p.id
    ), '[]'::jsonb),
    case when safety then exists (
      select 1 from public.member_emergency_contacts c where c.profile_id = p.id
    ) end
  from public.profiles p
  left join public.member_details d on d.profile_id = p.id
  where p.status = 'active'
    and (pattern is null or private.search_fold(p.full_name) like pattern)
    and (side_filter is null or p.side = side_filter)
    and (
      blood_filter is null
      or exists (select 1 from public.member_health h
                 where h.profile_id = p.id and h.blood_type = blood_filter)
    )
    and (
      not no_contact_only
      or not exists (select 1 from public.member_emergency_contacts c where c.profile_id = p.id)
    )
    and (
      after_id is null
      or (p.full_name collate "tr-x-icu", p.id) > (after_name collate "tr-x-icu", after_id)
    )
  order by p.full_name collate "tr-x-icu", p.id
  limit lim + 1;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean) FROM PUBLIC, "anon";

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
  STABLE
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

REVOKE ALL ON FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean) FROM PUBLIC, "anon";

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

  if not exists (select 1 from public.profiles p where p.id = target and p.status = 'active') then
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

REVOKE ALL ON FUNCTION "public"."member_safety_card"(uuid) FROM PUBLIC, "anon";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."member_safety_card"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_safety_card"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_safety_card"(uuid) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_safety_card"(uuid) TO "service_role";
