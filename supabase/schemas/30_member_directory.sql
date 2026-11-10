-- ---------------------------------------------------------------------------
-- Member directory: what active members may see of each other. Reads go
-- through these RPCs only (profiles, member_details and member_motorcycles
-- stay private); the RPCs apply the visibility switches.
-- ---------------------------------------------------------------------------

-- Accent- and case-insensitive folding for Turkish names ("İlker" / "ILKER" / "ilker").
-- lower() alone leaves "i̇" (i + combining dot) and doesn't map ı, so translate first.
create or replace function private.search_fold(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(value, 'İIıÇçĞğÖöŞşÜü', 'iiiccggoossuu'));
$$;

revoke all on function private.search_fold(text) from public, anon, authenticated;

-- The side filter is called side_filter: a parameter named side would clash with the output
-- column side (plpgsql: "parameter name used more than once").
create or replace function public.member_directory(
  search text default null,
  side_filter public.istanbul_side default null,
  after_name text default null,
  after_id uuid default null,
  page_size int default 25
)
returns table (
  id uuid,
  full_name text,
  avatar_url text,
  district text,
  side public.istanbul_side,
  birth_month smallint,
  birth_day smallint,
  instagram text,
  motorcycles jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.member_directory_counts(search text default null)
returns table (total bigint, asian bigint, european bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.member_directory(text, public.istanbul_side, text, uuid, int) from public, anon;
revoke all on function public.member_directory_counts(text) from public, anon;
grant execute on function public.member_directory(text, public.istanbul_side, text, uuid, int) to authenticated;
grant execute on function public.member_directory_counts(text) to authenticated;
