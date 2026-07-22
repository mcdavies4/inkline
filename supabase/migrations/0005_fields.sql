-- Inkline 0005: visual field placement
-- Run after 0004.

-- Each placed field on a document. Coordinates are page-relative FRACTIONS
-- (0..1) so they survive any render/display/PDF scale difference.
create table if not exists doc_fields (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sign_requests(id) on delete cascade,
  signer_id uuid references signers(id) on delete cascade,  -- null = any/first signer
  type text not null check (type in ('signature','date','initials','text')),
  page integer not null default 0,           -- 0-based page index
  x real not null,                           -- 0..1 from left
  y real not null,                           -- 0..1 from top
  w real not null default 0.2,               -- 0..1 width
  h real not null default 0.06,              -- 0..1 height
  -- date fields: 'auto' (stamp signing date) or 'signer' (signer picks)
  fill_mode text default 'auto' check (fill_mode in ('auto','signer')),
  -- captured value once the signer fills it: for text/initials/date; signatures use signature_path
  value text,
  value_path text,                           -- storage path for signature/initials images
  filled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_fields_request on doc_fields(request_id);
create index if not exists idx_fields_signer on doc_fields(signer_id);

-- Placement tokens: a private link for the SENDER to place fields.
create table if not exists placement_tokens (
  token text primary key,
  request_id uuid not null references sign_requests(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '24 hours',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_placement_request on placement_tokens(request_id);

-- Requests can now be in a 'placing' phase before delivery, and can skip it.
alter table sign_requests add column if not exists placement text not null default 'none'
  check (placement in ('none','pending','done'));

alter table doc_fields enable row level security;
alter table placement_tokens enable row level security;

-- Allow the placement bot state
alter table bot_sessions drop constraint if exists bot_sessions_state_check;
alter table bot_sessions add constraint bot_sessions_state_check
  check (state in (
    'idle','awaiting_name','awaiting_phone','awaiting_confirm',
    'awaiting_more','awaiting_flow','awaiting_otp',
    'template_field','template_name','awaiting_plan','awaiting_placement'
  ));
