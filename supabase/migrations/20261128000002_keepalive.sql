-- Keep the free Render API awake: ping /health every 10 minutes (Render sleeps after 15 idle minutes).
-- Also keeps the in-process scheduler ticking so scheduled tasks fire on time. Safe to re-run.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Replace any earlier copy of the job, then schedule it.
select cron.unschedule(jobid) from cron.job where jobname = 'trillion-api-keepalive';

select cron.schedule(
  'trillion-api-keepalive',
  '*/10 * * * *',
  $cron$ select net.http_get(url := 'https://trillion-api.onrender.com/health', timeout_milliseconds := 60000) $cron$
);

-- Check it:   select jobname, schedule, active from cron.job;
-- Recent runs: select status, start_time from cron.job_run_details order by start_time desc limit 5;
-- Remove it:  select cron.unschedule('trillion-api-keepalive');
