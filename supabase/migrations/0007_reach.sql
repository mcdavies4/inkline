-- Reach tracking: every person who interacts with the bot, so we can see the
-- true top of funnel (opened the bot) vs activation (actually sent a document).
-- Safe to run once.

create table if not exists bot_users (
  chat_id text primary key,
  name text,
  source text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists idx_bot_users_source on bot_users(source);

-- Funnel at a glance:
--   opened   = select count(*) from bot_users;
--   sent     = select count(*) from accounts;        -- a row is created on first document
--   signed   = select count(*) from sign_requests where status = 'signed';
