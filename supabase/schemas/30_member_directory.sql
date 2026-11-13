-- ---------------------------------------------------------------------------
-- Member directory: what active members may see of each other. Reads go
-- through this RPC only (profiles, member_details and member_motorcycles
-- stay private); it applies the visibility switches.
-- ---------------------------------------------------------------------------

-- Every matching active member, ordered by Turkish name then id (a total order). There is no limit in SQL: the
-- app reads the result in .range() chunks of 1,000 (PostgREST max_rows) up to its list ceiling and filters/pages in
-- the browser. Safety filters (blood_filter, no_contact) and has_emergency_contact need members.safety. Filtering by
-- blood type is logged, so the function is volatile; the log is written once per call, i.e. once per chunk (one chunk
-- while a blood group has <= 1,000 members).
create or replace function public.member_directory(
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
$$;

revoke all on function public.member_directory(public.blood_type, boolean) from public, anon;
grant execute on function public.member_directory(public.blood_type, boolean) to authenticated;
