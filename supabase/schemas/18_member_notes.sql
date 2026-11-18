-- ---------------------------------------------------------------------------
-- Staff notes about members (members.notes). Internal: the subject never sees
-- them, and nobody can edit a note; only admins delete. Notes about an active
-- admin-role holder (any status) are visible to admins only; never about oneself or a deleting account.
-- Deleted by cascade with the subject's profile; the author is nulled when the
-- author's profile goes.
-- ---------------------------------------------------------------------------

create table public.member_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 2000 and body = btrim(body)),
  created_at timestamptz not null default now()
);

comment on table public.member_notes is 'Staff notes about a member (members.notes). Append-only; admins may delete.';

create index member_notes_profile_idx on public.member_notes (profile_id, created_at desc, id desc);

-- May the caller read/write notes about target? Used by every policy.
create or replace function private.can_access_member_notes(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_permission('members.notes'))
    and target is distinct from (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = target
        and p.status <> 'deleting'
        and (
          (select private.is_admin())
          or not exists (select 1 from public.roles r where r.id = p.role_id and r.is_admin)
        )
    );
$$;

revoke all on function private.can_access_member_notes(uuid) from public, anon;
grant execute on function private.can_access_member_notes(uuid) to authenticated;

-- The author is always the caller (author_id has no insert grant either).
create or replace function private.member_notes_set_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  return new;
end;
$$;

revoke all on function private.member_notes_set_author() from public, anon, authenticated;

create trigger member_notes_set_author
before insert on public.member_notes
for each row execute function private.member_notes_set_author();

revoke all on table public.member_notes from anon, authenticated;
grant select, delete on table public.member_notes to authenticated;
grant insert (profile_id, body) on table public.member_notes to authenticated;

alter table public.member_notes enable row level security;

create policy "member_notes: read"
on public.member_notes
for select
to authenticated
using ((select private.can_access_member_notes(profile_id)));

create policy "member_notes: insert"
on public.member_notes
for insert
to authenticated
with check ((select private.can_access_member_notes(profile_id)));

create policy "member_notes: admins delete"
on public.member_notes
for delete
to authenticated
using ((select private.is_admin()) and (select private.can_access_member_notes(profile_id)));
