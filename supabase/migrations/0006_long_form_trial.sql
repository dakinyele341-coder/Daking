-- ============================================
-- LONG-FORM FREE TRIAL
-- Every user gets a fixed number of free long-form generations (see
-- FREE_LONG_FORM_LIMIT in lib/plans.ts); after that the feature shows as
-- "coming soon" until they're premium.
--
-- This counter deliberately lives in its OWN table, not on `profiles`:
-- users can UPDATE their own profile row (display_name), so a counter
-- there could be reset client-side. Here users can only SELECT their own
-- row; all writes go through the service-role client.
-- ============================================
create table long_form_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);

alter table long_form_usage enable row level security;

create policy "Users can view their own long-form usage"
  on long_form_usage for select
  using (auth.uid() = user_id);

-- NO insert/update/delete policy for regular users. The service-role client
-- (which bypasses RLS) is the only writer, via the function below.

-- Atomic increment (avoids read-modify-write races between parallel requests).
-- Returns the new count.
create or replace function increment_long_form_used(uid uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into long_form_usage (user_id, used)
  values (uid, 1)
  on conflict (user_id) do update
    set used = long_form_usage.used + 1,
        updated_at = now()
  returning used;
$$;

-- Only the service role may call it (users could otherwise only hurt
-- themselves by burning credits, but lock it down anyway).
revoke execute on function increment_long_form_used(uuid) from public, anon, authenticated;
