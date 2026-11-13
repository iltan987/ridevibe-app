SET local check_function_bodies = off;

DROP FUNCTION "private"."search_fold"(text);

DROP FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer, public.blood_type, boolean);

DROP FUNCTION "public"."member_directory_counts"(text, public.blood_type, boolean);

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
    has_emergency_contact boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
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
    ) end
  from public.profiles p
  left join public.member_details d on d.profile_id = p.id
  where p.status = 'active'
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

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory"(public.blood_type, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(public.blood_type, boolean) TO "service_role";
