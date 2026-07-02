-- Enable extensions
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES
-- One row per user (including anonymous users via Supabase anonymous auth)
-- ============================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  plan text not null default 'free' check (plan in ('free', 'premium')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup (including anonymous)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- ANIMATIONS (shared cache — generated content)
-- ============================================
create table animations (
  id uuid primary key default uuid_generate_v4(),
  question_hash text not null unique,   -- sha256 of normalized question+complexity
  question_text text not null,
  complexity text not null check (complexity in ('eli5', 'standard', 'advanced')),
  animation_data jsonb not null,
  summary text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  hit_count integer not null default 1
);

create index idx_animations_hash on animations(question_hash);
create index idx_animations_expires on animations(expires_at);

alter table animations enable row level security;

-- Anyone (including anon) can READ cached animations
create policy "Animations are publicly readable"
  on animations for select
  using (true);

-- NO insert/update/delete policy for regular users.
-- Only the service-role key (server-side only) can write here,
-- which bypasses RLS entirely. This means animations can ONLY
-- be created via your API routes, never directly from the client.

-- ============================================
-- USER HISTORY
-- ============================================
create table user_history (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  animation_id uuid not null references animations(id) on delete cascade,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_history_user on user_history(user_id);

alter table user_history enable row level security;

create policy "Users can view their own history"
  on user_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their own history"
  on user_history for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own history"
  on user_history for update
  using (auth.uid() = user_id);

create policy "Users can delete their own history"
  on user_history for delete
  using (auth.uid() = user_id);

-- ============================================
-- QUIZ RESULTS
-- ============================================
create table quiz_results (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  animation_id uuid not null references animations(id) on delete cascade,
  score integer not null,
  total integer not null,
  created_at timestamptz not null default now()
);

create index idx_quiz_user on quiz_results(user_id);

alter table quiz_results enable row level security;

create policy "Users can view their own quiz results"
  on quiz_results for select
  using (auth.uid() = user_id);

create policy "Users can insert their own quiz results"
  on quiz_results for insert
  with check (auth.uid() = user_id);

-- ============================================
-- SECURITY EVENT LOG (for abuse monitoring)
-- ============================================
create table security_events (
  id uuid primary key default uuid_generate_v4(),
  event_type text not null,   -- 'rate_limit_hit', 'validation_failed', 'auth_failed', etc.
  identifier text,             -- user_id or hashed IP
  metadata jsonb,
  created_at timestamptz not null default now()
);

alter table security_events enable row level security;
-- No policies = no client access at all. Service role only.
