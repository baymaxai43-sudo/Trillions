-- TRILLION hardening: token-only connectors, scheduled task lockdown, secret function lockdown.
-- Safe to re-run. Not applied automatically: run with `supabase db push` (or paste into the SQL editor).

-- 1. Connectors: token providers supabase + netlify ----------------------------------------
-- 'google' stays allowed so legacy OAuth rows remain valid (the API ignores them).
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.connections'::regclass
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%provider%'
  loop
    execute format('alter table public.connections drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.connections
  add constraint connections_provider_check
  check (provider in ('github','vercel','render','supabase','netlify','google'));

-- 2. Scheduled tasks: owners read, delete and pause/resume; only the API (service role) inserts ---------
drop policy if exists "owner all" on public.scheduled_tasks;
drop policy if exists "owner read" on public.scheduled_tasks;
drop policy if exists "owner delete" on public.scheduled_tasks;
drop policy if exists "owner toggle" on public.scheduled_tasks;

create policy "owner read" on public.scheduled_tasks for select using (owner_id = auth.uid());
create policy "owner delete" on public.scheduled_tasks for delete using (owner_id = auth.uid());
create policy "owner toggle" on public.scheduled_tasks for update
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Column grants: a client can flip `enabled` and nothing else (no prompt/schedule rewrites, no inserts).
revoke all on public.scheduled_tasks from anon, authenticated;
grant select, delete on public.scheduled_tasks to authenticated;
grant update (enabled) on public.scheduled_tasks to authenticated;

-- At most 10 enabled tasks per owner (checked on insert and on false -> true).
create or replace function public.enforce_scheduled_task_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare active int;
begin
  if new.enabled and (tg_op = 'INSERT' or not coalesce(old.enabled, false)) then
    perform pg_advisory_xact_lock(hashtext('scheduled_tasks:' || new.owner_id::text));
    select count(*) into active
      from public.scheduled_tasks
      where owner_id = new.owner_id and enabled and id <> new.id;
    if active >= 10 then
      raise exception 'You can have at most 10 active scheduled tasks' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.enforce_scheduled_task_limit() from public, anon, authenticated;

drop trigger if exists scheduled_tasks_limit on public.scheduled_tasks;
create trigger scheduled_tasks_limit before insert or update of enabled on public.scheduled_tasks
  for each row execute function public.enforce_scheduled_task_limit();

-- 3. Memories: pending (unconfirmed) memories are listed separately in the app ----------------------
create index if not exists memories_owner_confirmed_idx on public.memories (owner_id, confirmed, created_at desc);

-- 4. Hand-made secret getter: nobody but the service role / owner may execute it ---------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'get_app_secret'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

-- 5. Optional keep-alive for the free Render instance (NOT enabled) ------------------------------------
-- Pings /health every 10 minutes so scheduled tasks fire on time. Requires the pg_cron and pg_net
-- extensions (Dashboard -> Database -> Extensions) and the public API URL. To enable, uncomment:
--
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
-- select cron.schedule(
--   'trillion-api-keepalive',
--   '*/10 * * * *',
--   $cron$ select net.http_get('https://trillion-api.onrender.com/health') $cron$
-- );
--
-- To remove it later: select cron.unschedule('trillion-api-keepalive');
