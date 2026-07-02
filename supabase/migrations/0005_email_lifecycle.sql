-- ============================================
-- EMAIL LIFECYCLE
-- Tracks which lifecycle emails have been sent per user. Internal state —
-- written/read only by the service role (cron + API routes). No client policies.
-- ============================================
create table email_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  welcome_sent_at timestamptz,
  day3_sent_at timestamptz,
  day7_sent_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_email_lifecycle_welcome on email_lifecycle(welcome_sent_at);

alter table email_lifecycle enable row level security;
-- RLS enabled, zero policies → service role only.

-- ============================================
-- EMAIL RESPONSES
-- Survey/feedback responses captured from email link taps. Written by the
-- service role (the /api/email/respond route inserts after verifying a signed
-- token). RLS enabled with no policies → service role only.
-- ============================================
create table email_responses (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete set null,
  email_type text not null check (email_type in ('day3_checkin', 'day7_upgrade')),
  response text not null,
  created_at timestamptz not null default now()
);

create index idx_email_responses_type on email_responses(email_type);

alter table email_responses enable row level security;
-- RLS enabled, zero policies → service role only.
