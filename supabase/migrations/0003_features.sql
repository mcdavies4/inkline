-- Inkline 0003: multi-signer, OTP, AI summary, document templates, dashboard access
-- Run after 0001 and 0002.

-- ---------- Multi-signer support ----------
-- signers already exists; add ordering + per-signer sequencing.
alter table signers add column if not exists sign_order integer not null default 1;
alter table signers add column if not exists otp_code text;       -- hashed OTP if required
alter table signers add column if not exists otp_verified_at timestamptz;

-- requests: signing flow + whether OTP is required
alter table sign_requests add column if not exists signing_flow text not null default 'single'
  check (signing_flow in ('single','sequential','parallel'));
alter table sign_requests add column if not exists require_otp boolean not null default false;
alter table sign_requests add column if not exists ai_summary text;   -- Claude's plain-language summary

-- The 'signed' status on a request now means ALL signers are done.
-- Add an 'in_progress' status for partially-signed multi-signer requests.
alter table sign_requests drop constraint if exists sign_requests_status_check;
alter table sign_requests add constraint sign_requests_status_check
  check (status in ('pending','in_progress','signed','declined','expired','cancelled'));

-- ---------- Document templates (reusable forms in the bot) ----------
create table if not exists doc_templates (
  id uuid primary key default gen_random_uuid(),
  owner_phone text,                    -- null = global/system template
  keyword text not null,               -- e.g. 'TENANCY' — how the bot triggers it
  title text not null,
  description text,
  -- ordered list of {key,label,type} the bot collects, as jsonb
  fields jsonb not null default '[]',
  -- the document body with {{key}} placeholders
  body_template text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_templates_keyword on doc_templates(lower(keyword)) where owner_phone is null;
create index if not exists idx_templates_owner on doc_templates(owner_phone);

-- ---------- Dashboard magic-link access ----------
create table if not exists dashboard_tokens (
  token text primary key,
  sender_phone text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz
);
create index if not exists idx_dashboard_sender on dashboard_tokens(sender_phone);

-- ---------- Reminders bookkeeping ----------
alter table sign_requests add column if not exists last_reminder_at timestamptz;
alter table sign_requests add column if not exists reminder_count integer not null default 0;

alter table doc_templates enable row level security;
alter table dashboard_tokens enable row level security;

-- ---------- Seed one system template ----------
insert into doc_templates (owner_phone, keyword, title, description, fields, body_template)
values (
  null,
  'TENANCY',
  'Simple Tenancy Agreement',
  'A short assured shorthold-style tenancy for a single property.',
  '[
    {"key":"landlord","label":"Landlord full name","type":"text"},
    {"key":"tenant","label":"Tenant full name","type":"text"},
    {"key":"address","label":"Property address","type":"text"},
    {"key":"rent","label":"Monthly rent (e.g. £1200)","type":"text"},
    {"key":"deposit","label":"Deposit amount","type":"text"},
    {"key":"start","label":"Start date","type":"text"},
    {"key":"term","label":"Term in months","type":"text"}
  ]'::jsonb,
  'TENANCY AGREEMENT\n\nThis agreement is made between {{landlord}} ("the Landlord") and {{tenant}} ("the Tenant").\n\nPROPERTY: {{address}}\n\nTERM: {{term}} months, commencing {{start}}.\n\nRENT: {{rent}} per calendar month, payable in advance.\n\nDEPOSIT: {{deposit}}, to be protected in a government-approved deposit scheme.\n\nThe Tenant agrees to pay the rent on time, keep the property in good condition, and give one month''s notice to end the tenancy after the initial term.\n\nThe Landlord agrees to maintain the structure and exterior of the property and to respect the Tenant''s right to quiet enjoyment.\n\nSigned by the parties below.'
)
on conflict do nothing;

-- FIX: bot_sessions state constraint must include the v3 states,
-- otherwise multi-signer/template flows fail silently and the session sticks.
alter table bot_sessions drop constraint if exists bot_sessions_state_check;
alter table bot_sessions add constraint bot_sessions_state_check
  check (state in (
    'idle','awaiting_name','awaiting_phone','awaiting_confirm',
    'awaiting_more','awaiting_flow','awaiting_otp',
    'template_field','template_name'
  ));
