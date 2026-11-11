-- Growth: channel/source attribution for bot signups.
-- Links via t.me/InklineSignbot?start=src_<channel> are logged here so you can
-- see which channel or post actually brought users. Safe to run once.

create table if not exists bot_sources (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  source text not null,
  created_at timestamptz not null default now()
);

-- One person counts once per source, so the numbers stay clean.
create unique index if not exists idx_bot_sources_unique on bot_sources(chat_id, source);
create index if not exists idx_bot_sources_source on bot_sources(source);

-- See which channel is working:
--   select source, count(*) as users, max(created_at) as last_seen
--   from bot_sources group by source order by users desc;
