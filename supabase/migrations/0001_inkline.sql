-- Inkline: WhatsApp-first e-signatures
-- Run in Supabase SQL editor or via CLI.
-- Also create a PRIVATE storage bucket named: inkline

create extension if not exists pgcrypto;

-- Original uploaded documents
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,          -- inkline/originals/{id}.pdf
  sha256 text not null,                -- integrity hash of the original
  size_bytes integer not null,
  created_at timestamptz not null default now()
);

-- One signing request per document send-out
create table if not exists sign_requests (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  sender_name text not null,           -- shown to the signer ("Acme Ltd asks you to sign…")
  message text,                        -- optional note from sender
  mode text not null default 'signature' check (mode in ('signature','quick_approval')),
  status text not null default 'pending' check (status in ('pending','signed','declined','expired','cancelled')),
  signed_pdf_path text,                -- inkline/signed/{id}.pdf once complete
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Signers (v1 supports one per request; schema allows more later)
create table if not exists signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sign_requests(id) on delete cascade,
  phone_e164 text not null,            -- e.g. 447700900123 (no +, Meta format)
  name text not null,
  sign_token text not null unique,     -- random URL token for /sign/{token}
  status text not null default 'pending' check (status in ('pending','viewed','signed','declined')),
  signature_path text,                 -- inkline/signatures/{id}.png
  signed_at timestamptz,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_signers_phone on signers(phone_e164);
create index if not exists idx_signers_token on signers(sign_token);
create index if not exists idx_requests_status on sign_requests(status);

-- Append-only audit trail (this is the product, not the signature)
create table if not exists audit_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references sign_requests(id) on delete cascade,
  signer_id uuid references signers(id) on delete set null,
  event_type text not null,            -- request_created | wa_sent | link_opened | doc_viewed |
                                       -- signed | quick_approved | declined | signed_pdf_delivered
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_request on audit_events(request_id);

-- All access in v1 goes through the service role (API routes). Lock the tables down.
alter table documents enable row level security;
alter table sign_requests enable row level security;
alter table signers enable row level security;
alter table audit_events enable row level security;
