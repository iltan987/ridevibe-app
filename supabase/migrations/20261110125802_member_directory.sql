SET local check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.search_fold (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select lower(translate(value, 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu'));
$function$;

CREATE OR REPLACE FUNCTION public.member_directory (
  search      text                 DEFAULT NULL::text,
  side_filter public.istanbul_side DEFAULT NULL::public.istanbul_side,
  after_name  text                 DEFAULT NULL::text,
  after_id    uuid                 DEFAULT NULL::uuid,
  page_size   integer              DEFAULT 25
)
  RETURNS TABLE (
    id          uuid,
    full_name   text,
    avatar_url  text,
    district    text,
    side        public.istanbul_side,
    birth_month smallint,
    birth_day   smallint,
    instagram   text,
    motorcycles jsonb
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pattern text;
  lim int := least(greatest(coalesce(page_size, 25), 1), 100);
begin
  if not private.is_active_member() then
    raise exception 'active members only' using errcode = '42501';
  end if;

  if (after_name is null) <> (after_id is null) then
    raise exception 'after_name and after_id go together' using errcode = '22023';
  end if;

  if nullif(btrim(left(search, 60)), '') is not null then
    pattern := '%' || replace(replace(replace(
      private.search_fold(btrim(left(search, 60))), '\', '\\'), '%', '\%'), '_', '\_') || '%';
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
      select jsonb_agg(jsonb_build_object('brand', m.brand, 'model', m.model, 'cc', m.cc) order by m.created_at, m.id)
      from public.member_motorcycles m
      where m.profile_id = p.id
    ), '[]'::jsonb)
  from public.profiles p
  left join public.member_details d on d.profile_id = p.id
  where p.status = 'active'
    and (pattern is null or private.search_fold(p.full_name) like pattern)
    and (side_filter is null or p.side = side_filter)
    and (
      after_id is null
      or (p.full_name collate "tr-x-icu", p.id) > (after_name collate "tr-x-icu", after_id)
    )
  order by p.full_name collate "tr-x-icu", p.id
  limit lim + 1;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer) FROM PUBLIC, "anon";

CREATE OR REPLACE FUNCTION public.member_directory_counts (
  search text DEFAULT NULL::text
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
begin
  if not private.is_active_member() then
    raise exception 'active members only' using errcode = '42501';
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
    and (pattern is null or private.search_fold(p.full_name) like pattern);
end;
$function$;

REVOKE ALL ON FUNCTION "public"."member_directory_counts"(text) FROM PUBLIC, "anon";

REVOKE ALL ON FUNCTION "private"."search_fold"(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."search_fold"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory"(text, public.istanbul_side, text, uuid, integer) TO "service_role";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."member_directory_counts"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text) TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."member_directory_counts"(text) TO "service_role";
