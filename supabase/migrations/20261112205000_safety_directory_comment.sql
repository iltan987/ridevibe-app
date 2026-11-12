SET local check_function_bodies = off;

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
