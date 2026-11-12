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
-- Safety filters (blood_filter, no_contact) and has_emergency_contact need members.safety. Filtering
-- by blood type is logged, so the function is volatile.
create or replace function public.member_directory(
  search text default null,
  side_filter public.istanbul_side default null,
  after_name text default null,
  after_id uuid default null,
  page_size int default 25,
  blood_filter public.blood_type default null,
  no_contact boolean default false
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
  motorcycles jsonb,
  has_emergency_contact boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
$$;

create or replace function public.member_directory_counts(
  search text default null,
  blood_filter public.blood_type default null,
  no_contact boolean default false
)
returns table (total bigint, asian bigint, european bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.member_directory(text, public.istanbul_side, text, uuid, int, public.blood_type, boolean) from public, anon;
revoke all on function public.member_directory_counts(text, public.blood_type, boolean) from public, anon;
grant execute on function public.member_directory(text, public.istanbul_side, text, uuid, int, public.blood_type, boolean) to authenticated;
grant execute on function public.member_directory_counts(text, public.blood_type, boolean) to authenticated;
