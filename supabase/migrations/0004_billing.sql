-- Inkline 0004: free credits + Stripe subscription
-- Run after 0003.

-- One account per sender (keyed by their WhatsApp number)
create table if not exists accounts (
  phone_e164 text primary key,
  documents_used integer not null default 0,   -- lifetime count of documents sent
  free_limit integer not null default 3,
  plan text not null default 'free' check (plan in ('free','active','past_due','cancelled')),
  provider text check (provider in ('stripe','flutterwave')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,               -- when the paid period lapses
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_accounts_stripe_customer on accounts(stripe_customer_id);
create index if not exists idx_accounts_stripe_sub on accounts(stripe_subscription_id);

-- Pending checkout sessions, so a returning webhook can find the sender
create table if not exists checkout_sessions (
  id text primary key,                          -- Stripe checkout session id
  phone_e164 text not null,
  provider text not null,
  status text not null default 'pending' check (status in ('pending','complete','expired')),
  created_at timestamptz not null default now()
);
create index if not exists idx_checkout_phone on checkout_sessions(phone_e164);

alter table accounts enable row level security;
alter table checkout_sessions enable row level security;

-- Helper: whether an account may send another document right now.
-- (Enforced in code too; this is for convenience/reporting.)
create or replace function can_send(p_phone text) returns boolean as $$
  select case
    when a.plan = 'active' then true
    when a.plan is null then true
    else coalesce(a.documents_used, 0) < coalesce(a.free_limit, 3)
  end
  from accounts a where a.phone_e164 = p_phone;
$$ language sql stable;

-- Allow the plan-selection bot state
alter table bot_sessions drop constraint if exists bot_sessions_state_check;
alter table bot_sessions add constraint bot_sessions_state_check
  check (state in (
    'idle','awaiting_name','awaiting_phone','awaiting_confirm',
    'awaiting_more','awaiting_flow','awaiting_otp',
    'template_field','template_name','awaiting_plan'
  ));
