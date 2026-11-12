-- Data only (iltan, 2026-11-13): the "Organizatör" role is for ride organizers / captains, who need the safety data
-- at the roadside, not the applications. Replace its migrated default (applications.view, applications.review) with
-- members.safety. Matched by name; a no-op if the role was renamed or deleted. Nobody holds the role yet.

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.name = 'Organizatör'
  and not r.is_admin
  and rp.permission in ('applications.view', 'applications.review');

insert into public.role_permissions (role_id, permission)
select r.id, 'members.safety'
from public.roles r
where r.name = 'Organizatör'
  and not r.is_admin
on conflict (role_id, permission) do nothing;
