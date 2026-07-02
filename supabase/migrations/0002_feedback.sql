-- ============================================
-- FEEDBACK
-- In-app feedback. Write-only for users: they can INSERT their own rows but
-- have NO select policy, so no one can read others' (or their own) feedback
-- from the client. Read it via the Supabase dashboard or a future admin view.
-- ============================================
create table feedback (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('bug', 'idea', 'confusing', 'other')),
  message text not null check (char_length(message) <= 1000),
  page_path text,
  created_at timestamptz not null default now()
);

create index idx_feedback_created on feedback(created_at);

alter table feedback enable row level security;

create policy "Users can insert their own feedback"
  on feedback for insert
  with check (auth.uid() = user_id or user_id is null);
