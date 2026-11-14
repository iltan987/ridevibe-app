-- Nightly purge of accounts whose 14-day deletion grace period is over: 02:00 UTC = 05:00 Istanbul.
-- Scheduling is data (cron.job), not schema, so it is hand-written; idempotent.
create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'purge-deleted-accounts';

select cron.schedule('purge-deleted-accounts', '0 2 * * *', 'select private.purge_deleted_accounts()');
