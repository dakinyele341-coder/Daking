-- ============================================
-- SUBSCRIPTION COLUMNS (forward-compatibility stub)
-- These columns exist so a future monetization pass can wire up checkout +
-- webhooks WITHOUT a migration that rewrites every existing profile row.
-- No checkout flow, webhook handler, or pricing page ships in this pass.
-- ============================================
alter table profiles add column subscription_status text
  not null default 'none'
  check (subscription_status in ('none', 'active', 'cancelled', 'past_due'));

alter table profiles add column subscription_provider text;
