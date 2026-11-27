-- TRILLION Phase 3: agent harness. Runs, steps, connector tokens, scheduled prompts, artifacts.
-- The API writes these tables with the service role; clients only read their own rows.

-- Agent runs ----------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  parent_run_id uuid references public.agent_runs(id) on delete cascade,
  scheduled_task_id uuid,
  goal text not null,
  status text not null default 'queued'
    check (status in ('queued','running','waiting_approval','completed','failed','cancelled')),
  model text,
  provider text,
  plan jsonb not null default '[]'::jsonb,
  result text,
  error text,
  step_count int not null default 0,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_runs_owner_idx on public.agent_runs (owner_id, created_at desc);
create index if not exists agent_runs_status_idx on public.agent_runs (status);

create table if not exists public.agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  seq int not null,
  kind text not null check (kind in ('plan','tool_call','tool_result','confirmation','message','artifact','error')),
  tool text,
  args jsonb,
  ok boolean,
  summary text,
  data jsonb,
  status text,
  created_at timestamptz not null default now()
);
create index if not exists agent_steps_run_idx on public.agent_steps (run_id, seq);

-- Connector tokens (encrypted server-side with AES-256-GCM; ciphertext never readable by clients)
create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('github','google','vercel','render')),
  account_label text,
  scopes text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, provider)
);

-- Scheduled prompts ------------------------------------------------------------------
create table if not exists public.scheduled_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  prompt text not null,
  kind text not null check (kind in ('once','interval','daily')),
  run_at timestamptz,
  every_minutes int check (every_minutes is null or every_minutes >= 15),
  time_of_day text check (time_of_day is null or time_of_day ~ '^[0-2][0-9]:[0-5][0-9]$'),
  timezone text not null default 'Africa/Lagos',
  next_run_at timestamptz,
  enabled boolean not null default true,
  last_run_id uuid references public.agent_runs(id) on delete set null,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scheduled_tasks_due_idx on public.scheduled_tasks (next_run_at) where enabled;

-- Memory full-text search ----------------------------------------------------------------
alter table public.memories
  add column if not exists fts tsvector generated always as (to_tsvector('english', content)) stored;
create index if not exists memories_fts_idx on public.memories using gin (fts);

-- RLS ------------------------------------------------------------------------------------
alter table public.agent_runs      enable row level security;
alter table public.agent_steps     enable row level security;
alter table public.connections     enable row level security;
alter table public.scheduled_tasks enable row level security;

drop policy if exists "owner read" on public.agent_runs;
create policy "owner read" on public.agent_runs for select using (owner_id = auth.uid());
drop policy if exists "owner read" on public.agent_steps;
create policy "owner read" on public.agent_steps for select using (owner_id = auth.uid());

drop policy if exists "owner read" on public.connections;
create policy "owner read" on public.connections for select using (owner_id = auth.uid());
drop policy if exists "owner delete" on public.connections;
create policy "owner delete" on public.connections for delete using (owner_id = auth.uid());
-- Column-level grants: clients can see which providers are linked, never the ciphertext.
revoke all on public.connections from anon, authenticated;
grant select (id, owner_id, provider, account_label, scopes, expires_at, created_at, updated_at)
  on public.connections to authenticated;
grant delete on public.connections to authenticated;

drop policy if exists "owner all" on public.scheduled_tasks;
create policy "owner all" on public.scheduled_tasks for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- updated_at triggers ----------------------------------------------------------------------
drop trigger if exists touch_agent_runs on public.agent_runs;
create trigger touch_agent_runs before update on public.agent_runs
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_connections on public.connections;
create trigger touch_connections before update on public.connections
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_scheduled_tasks on public.scheduled_tasks;
create trigger touch_scheduled_tasks before update on public.scheduled_tasks
  for each row execute function public.touch_updated_at();

-- Artifacts bucket (private; files live under <user_id>/...) ------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('artifacts', 'artifacts', false, 5242880)
on conflict (id) do nothing;

drop policy if exists "artifacts owner read" on storage.objects;
create policy "artifacts owner read" on storage.objects for select to authenticated
  using (bucket_id = 'artifacts' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "artifacts owner delete" on storage.objects;
create policy "artifacts owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'artifacts' and (storage.foldername(name))[1] = auth.uid()::text);
