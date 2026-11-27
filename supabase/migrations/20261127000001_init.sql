-- TRILLION Phase 1 schema. Every user-owned table has RLS keyed on auth.uid().
create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- Profiles ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, new.raw_user_meta_data->>'name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Projects ------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projects (owner_id);

-- Conversations & messages ---------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.conversations (owner_id, updated_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system','tool')),
  content text not null,
  model text,
  provider text,
  input_tokens int,
  output_tokens int,
  feedback smallint check (feedback in (-1, 1)),
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at);

-- Memory ----------------------------------------------------------------------
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  content text not null,
  source text not null default 'explicit' check (source in ('explicit','suggested')),
  confirmed boolean not null default false,
  embedding vector(768),
  embedding_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.memories (owner_id);

-- Agent tasks -------------------------------------------------------------------
create table public.agent_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  goal text not null,
  status text not null default 'queued'
    check (status in ('queued','running','waiting_approval','completed','failed','cancelled')),
  plan jsonb,
  budget_credits numeric(12,2),
  result jsonb,
  cancel_requested boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.agent_tasks (owner_id, created_at desc);

create table public.task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.agent_tasks(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  idx int not null,
  summary text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- Usage (append-only; written by the server with the service role) --------------
create table public.usage_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,          -- ai | agent | app_gen | build | browser
  provider text,
  model text,
  input_tokens int default 0,
  output_tokens int default 0,
  credits numeric(12,4) not null default 0,
  ref_id uuid,
  created_at timestamptz not null default now()
);
create index on public.usage_records (owner_id, created_at desc);

-- RLS ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.conversations  enable row level security;
alter table public.messages       enable row level security;
alter table public.memories       enable row level security;
alter table public.agent_tasks    enable row level security;
alter table public.task_steps     enable row level security;
alter table public.usage_records  enable row level security;

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['projects','conversations','messages','memories','agent_tasks','task_steps'] loop
    execute format('create policy "owner all" on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
  end loop;
end $$;

-- Users can read their usage but never write it.
create policy "owner read" on public.usage_records for select using (owner_id = auth.uid());

-- updated_at ---------------------------------------------------------------------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','projects','conversations','memories','agent_tasks'] loop
    execute format('create trigger touch_%1$s before update on public.%1$I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
