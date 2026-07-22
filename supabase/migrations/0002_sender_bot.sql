-- Inkline 0002: sender-side WhatsApp bot
-- Senders create requests by chatting with the bot: send a PDF → name → number → SEND.

alter table sign_requests add column if not exists sender_phone text;
create index if not exists idx_requests_sender_phone on sign_requests(sender_phone);

-- One lightweight conversation state per WhatsApp number (same pattern as Nolgic's bot)
create table if not exists bot_sessions (
  phone_e164 text primary key,
  state text not null default 'idle'
    check (state in ('idle','awaiting_name','awaiting_phone','awaiting_confirm')),
  data jsonb not null default '{}',   -- { document_id, filename, signer_name, signer_phone }
  updated_at timestamptz not null default now()
);

alter table bot_sessions enable row level security;
