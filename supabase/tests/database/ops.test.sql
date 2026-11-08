-- Run with: pnpm db:test
begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

set local role anon;
select is(public.keep_alive(), true, 'anon (the cron) can call keep_alive()');
select throws_ok('select id from public.profiles', '42501', null, 'keep_alive grant does not widen anon access');
reset role;

set local role authenticated;
select throws_ok('select public.keep_alive()', '42501', null, 'only anon may call keep_alive()');
reset role;

select * from finish();
rollback;
