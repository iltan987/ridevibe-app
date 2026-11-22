-- Removes the demo data of scripts/dev/seed.sql (local only). Events go first: deleting their author would only null
-- created_by and leave them behind. Deletes every event organizer@test.local created, also ones you made by hand.
-- Run: docker exec -i supabase_db_ridevibe psql -U postgres -v ON_ERROR_STOP=1 < scripts/dev/unseed.sql
begin;
delete from public.events where created_by = (select id from auth.users where email = 'organizer@test.local');
delete from auth.users where email like 'seed-%@fixture.invalid';
commit;
